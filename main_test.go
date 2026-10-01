package main

import (
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/pem"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEnsureCertGeneratesValidLocalhostCert(t *testing.T) {
	dir := t.TempDir()
	certFile := filepath.Join(dir, "certs", "localhost.crt")
	keyFile := filepath.Join(dir, "certs", "localhost.key")

	if err := ensureCert(certFile, keyFile); err != nil {
		t.Fatalf("ensureCert: %v", err)
	}

	certPEM, err := os.ReadFile(certFile)
	if err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode(certPEM)
	if block == nil || block.Type != "CERTIFICATE" {
		t.Fatalf("cert file is not a PEM CERTIFICATE")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}

	// SANs must cover localhost and the loopback IPs, and the validity window
	// must be current, or browsers will reject the connection.
	if cert.DNSNames[0] != "localhost" {
		t.Errorf("DNS SAN = %v, want localhost", cert.DNSNames)
	}
	if !cert.IPAddresses[0].Equal(net.ParseIP("127.0.0.1")) {
		t.Errorf("IP SAN = %v, want 127.0.0.1", cert.IPAddresses)
	}
	now := time.Now()
	if now.Before(cert.NotBefore) || now.After(cert.NotAfter) {
		t.Errorf("validity window %v..%v does not contain now", cert.NotBefore, cert.NotAfter)
	}

	// The private key file must be parseable and match the certificate.
	keyPEM, err := os.ReadFile(keyFile)
	if err != nil {
		t.Fatal(err)
	}
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		t.Fatal("key file is not PEM")
	}
	key, err := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	if err != nil {
		t.Fatalf("parse key: %v", err)
	}
	ecKey, ok := key.(*ecdsa.PrivateKey)
	if !ok {
		t.Fatalf("key type %T, want *ecdsa.PrivateKey", key)
	}
	certPub, ok := cert.PublicKey.(*ecdsa.PublicKey)
	if !ok {
		t.Fatalf("cert public key type %T, want *ecdsa.PublicKey", cert.PublicKey)
	}
	if !certPub.Equal(&ecKey.PublicKey) {
		t.Error("certificate and key file do not form a pair")
	}

	info, err := os.Stat(keyFile)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("key mode = %v, want 0600", info.Mode().Perm())
	}
}

func TestEnsureCertReusesExisting(t *testing.T) {
	dir := t.TempDir()
	certFile := filepath.Join(dir, "localhost.crt")
	keyFile := filepath.Join(dir, "localhost.key")

	if err := ensureCert(certFile, keyFile); err != nil {
		t.Fatalf("first ensureCert: %v", err)
	}
	first, err := os.ReadFile(certFile)
	if err != nil {
		t.Fatal(err)
	}

	// An existing pair must be reused, not regenerated.
	if err := ensureCert(certFile, keyFile); err != nil {
		t.Fatalf("second ensureCert: %v", err)
	}
	second, err := os.ReadFile(certFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Error("existing certificate was regenerated")
	}
}
