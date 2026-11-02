package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"sort"
	"strings"
	"time"
)

func newSerial() (*big.Int, error) {
	return rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
}

func createCA() ([]byte, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	serial, err := newSerial()
	if err != nil {
		return nil, nil, err
	}
	cert := &x509.Certificate{
		SerialNumber: serial, Subject: pkix.Name{CommonName: "TaratorMusic Phone Sync"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().AddDate(10, 0, 0),
		IsCA: true, BasicConstraintsValid: true, MaxPathLenZero: true,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), err
}

func lanIPs() []string {
	ips := []string{"127.0.0.1"}
	addresses, _ := net.InterfaceAddrs()
	for _, address := range addresses {
		ip, _, err := net.ParseCIDR(address.String())
		if err == nil && ip.To4() != nil && ip.IsPrivate() {
			ips = append(ips, ip.String())
		}
	}
	sort.Strings(ips)
	return ips
}

func (s *syncServer) certificate(ips []string) (*tls.Certificate, error) {
	s.certMu.Lock()
	defer s.certMu.Unlock()
	addresses := strings.Join(ips, ",")
	if s.cert != nil && s.certAddresses == addresses && time.Until(s.cert.Leaf.NotAfter) > 24*time.Hour {
		return s.cert, nil
	}
	ca, err := tls.X509KeyPair(s.state.Cert, s.state.Key)
	if err != nil {
		return nil, err
	}
	root, err := x509.ParseCertificate(ca.Certificate[0])
	if err != nil {
		return nil, err
	}
	if time.Now().After(root.NotAfter) {
		return nil, fmt.Errorf("phone sync CA expired; remove the offline-sync state folder and pair again")
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	serial, err := newSerial()
	if err != nil {
		return nil, err
	}
	cert := &x509.Certificate{
		SerialNumber: serial, Subject: pkix.Name{CommonName: "TaratorMusic LAN"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().AddDate(0, 3, 0),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	for _, address := range ips {
		cert.IPAddresses = append(cert.IPAddresses, net.ParseIP(address))
	}
	der, err := x509.CreateCertificate(rand.Reader, cert, root, &key.PublicKey, ca.PrivateKey)
	if err != nil {
		return nil, err
	}
	leaf, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	s.cert = &tls.Certificate{Certificate: [][]byte{der, root.Raw}, PrivateKey: key, Leaf: leaf}
	s.certAddresses = addresses
	return s.cert, nil
}

func (s *syncServer) fingerprint() string {
	block, _ := pem.Decode(s.state.Cert)
	sum := sha256.Sum256(block.Bytes)
	return hex.EncodeToString(sum[:])
}
