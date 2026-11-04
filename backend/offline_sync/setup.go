package main

import (
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"html"
	"net"
	"net/http"
	"strings"
)

func (s *syncServer) setupHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
		if !localRequest(r) || (r.Method != "GET" && r.Method != "HEAD") {
			http.Error(w, "Setup only", http.StatusForbidden)
			return
		}
		if r.URL.Path == "/ca.crt" {
			w.Header().Set("Content-Type", "application/x-x509-ca-cert")
			w.Header().Set("Content-Disposition", `attachment; filename="TaratorMusic.crt"`)
			w.Write(s.state.Cert)
			return
		}
		if r.URL.Path == "/ca.mobileconfig" {
			w.Header().Set("Content-Type", "application/x-apple-aspen-config")
			w.Header().Set("Content-Disposition", `attachment; filename="TaratorMusic.mobileconfig"`)
			block, _ := pem.Decode(s.state.Cert)
			fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>PayloadContent</key><array><dict><key>PayloadType</key><string>com.apple.security.root</string><key>PayloadVersion</key><integer>1</integer><key>PayloadIdentifier</key><string>music.tarator.sync.root</string><key>PayloadUUID</key><string>9C09DDB2-E50E-4F81-B6C5-3D24C1FD995C</string><key>PayloadDisplayName</key><string>TaratorMusic Phone Sync CA</string><key>PayloadContent</key><data>%s</data></dict></array>
<key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer><key>PayloadIdentifier</key><string>music.tarator.sync</string><key>PayloadUUID</key><string>B2B4677A-A582-4E62-923D-F55075CE684F</string><key>PayloadDisplayName</key><string>TaratorMusic Phone Sync</string></dict></plist>`, base64.StdEncoding.EncodeToString(block.Bytes))
			return
		}
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		file, instructions := "/ca.crt", "Android: set a screen lock. Install this file in Settings > Security & privacy > More security settings > Encryption & credentials > Install a certificate > CA certificate. Restart Chrome."
		if strings.Contains(r.UserAgent(), "iPhone") || strings.Contains(r.UserAgent(), "iPad") {
			file, instructions = "/ca.mobileconfig", "iPhone: open this page in Safari. Download the profile, then install it in Settings > General > VPN & Device Management. Then enable it in Settings > General > About > Certificate Trust Settings > Enable Full Trust."
		}
		host, _, _ := net.SplitHostPort(r.Host)
		if net.ParseIP(host) == nil {
			http.Error(w, "Use the IP address shown on the desktop", http.StatusBadRequest)
			return
		}
		endpoint := "https://" + net.JoinHostPort(host, s.httpsPort)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TaratorMusic phone setup</title><style>body{font:18px system-ui;max-width:640px;margin:40px auto;padding:20px;line-height:1.6}code{overflow-wrap:anywhere}a{display:block;margin:20px 0}</style><h1>Phone sync setup</h1><p>Only install the CA from your own desktop. Match this SHA-256 fingerprint with Settings > Phone sync on the desktop:</p><code>%s</code><p>%s</p><a href="%s">Download phone certificate</a><p>After installing and trusting it, return to the phone app. Use this desktop address and the short code shown on the desktop:</p><code>%s</code><a href="%s">Open phone app</a><p>This HTTP page only supplies the public certificate. Pairing and all library transfers use HTTPS. A certificate warning must be fixed by installing and trusting the CA.</p></html>`, s.fingerprint(), instructions, file, html.EscapeString(endpoint), html.EscapeString(s.pageURL))
	})
}
