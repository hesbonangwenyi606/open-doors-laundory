# Open Doors Laundromat POS — Hardware Integration Guide

**Document Version:** 1.0.0  
**Last Updated:** 2026-09-25  
**Application Version:** 1.0.0

---

## Overview

This document describes the hardware integration capabilities and requirements for the Open Doors Laundromat POS system.

---

## Scanners

### Supported Scanner Types

| Type | Connection | Browser Support | Status |
|------|-----------|-----------------|--------|
| USB Keyboard-Emulation | USB | All browsers | ✅ Supported |
| Bluetooth Keyboard-Emulation | Bluetooth | All browsers | ✅ Supported |
| WebHID Scanners | USB/HID | Chrome/Edge | ⚠️ Needs implementation |
| WebUSB Scanners | USB | Chrome/Edge | ⚠️ Needs implementation |
| Web Serial Scanners | Serial | Chrome/Edge | ⚠️ Needs implementation |

### Connection Methods

#### Keyboard-Emulation Scanners (Currently Supported)

USB and Bluetooth barcode scanners that emulate keyboard input work natively in any browser. When a barcode is scanned, the characters are sent as keyboard input to the currently focused element.

**Configuration:**
1. Configure scanner to output in "Keyboard Wedge" mode
2. Ensure the input field is focused before scanning
3. Scanner sends characters followed by Enter key
4. The POS form automatically processes the input

**Testing Procedure:**
1. Connect USB barcode scanner
2. Open browser and navigate to POS page
3. Focus any text input field
4. Scan a barcode
5. Verify the scanned characters appear in the input field
6. If the scanner sends Enter, the form submits automatically

#### WebHID Scanners (Planned)

For advanced barcode scanners that use HID protocol directly:

```javascript
// Future implementation would use:
navigator.hid.requestDevice({ filters: [{ usagePage: 0x01, usage: 0x0006 }] })
  .then(devices => {
    const device = devices[0];
    await device.open();
    device.addEventListener('inputreport', (event) => {
      const barcode = decodeBarcode(event.data);
      addToOrder(barcode);
    });
  });
```

### Browser Limitations

- WebHID/WebUSB/Web Serial require HTTPS and user permission
- Firefox has limited WebHID support
- Safari does not support WebHID/WebUSB
- Chrome/Edge have the best support

---

## Thermal Printers

### Supported Printer Types

| Type | Connection | Status | Notes |
|------|-----------|--------|-------|
| 58mm USB | USB | ✅ Via browser print | System printer |
| 58mm Network | Network | ✅ Via browser print | System printer |
| 58mm Bluetooth | Bluetooth | ⚠️ Requires bridge | Not directly supported |
| 80mm USB | USB | ✅ Via browser print | System printer |
| 80mm Network | Network | ✅ Via browser print | System printer |
| ESC/POS compatible | USB/Network | ✅ Via browser print | System printer |

### Browser Limitations

**Important:** Browser JavaScript cannot directly control USB or Bluetooth printers due to security restrictions. This is a browser security feature, not a limitation of the application.

The web application can:
- ✅ Print to the system's default printer via `window.print()`
- ✅ Generate PDF receipts for download
- ✅ Use CSS `@media print` for printer-friendly formatting
- ✅ Generate HTML that opens in print dialog

The web application cannot:
- ❌ Directly access USB printers
- ❌ Directly access Bluetooth printers
- ❌ Send ESC/POS commands directly from browser
- ❌ Access network printers without system configuration

### Realistic Architecture

```text
Browser (Web App)
    ↓
window.print() / PDF Generation
    ↓
Browser Print Dialog
    ↓
System Printer Queue
    ↓
OS Print System (CUPS, etc.)
    ↓
Thermal Printer (USB/Network/Bluetooth)
```

### Configuration for Thermal Printers

#### USB Thermal Printers (Linux)

1. Connect USB thermal printer
2. Check printer detection: `lsusb`
3. Install printer drivers (e.g., `apt install cups`)
4. Add printer via CUPS web interface: `http://localhost:631`
5. Set as default printer
6. Test print from browser

#### Network Thermal Printers (Linux)

1. Note printer IP address
2. Add printer via CUPS: `http://localhost:631/admin`
3. Use IPP protocol: `ipp://printer-ip:631/ipp/print`
4. Install appropriate driver
5. Set as default printer
6. Test print from browser

#### ESC/POS USB Printers

For ESC/POS-compatible printers, install the appropriate driver:
- **Epson TM-T20/TM-T88:** Use `epson-inkjet-printer-escpr` package
- **Star Micronics:** Use Star PRNT emulator
- **Custom ESC/POS:** Use `python-escpos` with CUPS backend

### 58mm vs 80mm Receipt Format

The application is designed for 58mm thermal receipts:
- **CSS width:** `@page { size: 58mm; margin: 0; }`
- **Font size:** 11px for content, 9px for details
- **Paper width:** 58mm (2.28 inches)

For 80mm printers:
- Modify `@page { size: 80mm; }` in print CSS
- Adjust receipt margins and font sizes
- 80mm printers are commonly used for higher-quality receipts

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Print dialog shows wrong printer | Set default printer via system settings |
| Receipt cuts off | Check CSS page size matches printer paper width |
| Print quality poor | Use appropriate driver for printer model |
| USB printer not detected | Check `lsusb`, install drivers, restart CUPS |
| Network printer not found | Check network connection, firewall rules |
| Print jobs stuck | Check print queue via `lpq`, restart CUPS |
| Receipt too wide | Reduce font sizes, adjust CSS margins |
| Colors not printing | Ensure printer is set to monochrome/grayscale |

---

## Receipt Printing Fallback

### User Experience Flow

```text
Complete Payment
    ↓
Receipt Generated
    ↓
Try Print
    ↓
Printer Unavailable?
    ↓
Download PDF
    ↓
View Receipt
```

### Fallback Implementation

The `OfflinePOSPage.jsx` provides three options:
1. **Print** - Opens browser print dialog
2. **Download PDF** - Generates and downloads PDF using jsPDF
3. **View Receipt** - Shows receipt in current page (accessible anytime)

If printing fails:
- User can still download the PDF
- User can navigate back to view the receipt anytime
- The receipt is permanently stored in IndexedDB
- Error messages are displayed clearly, never falsely reporting success

---

## Hardware Requirements

### Minimum Requirements

| Component | Requirement |
|-----------|-------------|
| Browser | Chrome 90+, Firefox 90+, Edge 90+ |
| RAM | 4GB |
| Storage | 1GB for application |
| Database | SQLite file (for development) / PostgreSQL (for production) |
| Network | Internet connection required for initial setup |
| Server | Node.js 20+ |

### Recommended Hardware for Production

| Component | Recommendation |
|-----------|---------------|
| Browser | Chrome or Edge |
| RAM | 8GB |
| Storage | 10GB SSD |
| Database | PostgreSQL 16+ |
| Server | Dedicated VPS or local server |
| Printer | 58mm or 80mm thermal USB/network |
| Scanner | USB keyboard-emulation barcode scanner |
| UPS | Battery backup for power outages |

### POS Device Requirements

For the POS to be functional in a retail environment:
- Touchscreen recommended (for mobile POS usability)
- Mouse and keyboard for desktop POS
- Thermal printer (58mm recommended)
- Barcode scanner (optional, keyboard-emulation)
- Cash drawer (if cash payments)
- M-Pesa API access (if M-Pesa payments)

---

## Configuration

### Environment Variables

```env
# Required
DATABASE_URL="file:./dev.db"           # PostgreSQL for production
ADMIN_EMAIL="admin@opendoorslaundromat.co.ke"
ADMIN_PASSWORD="your-strong-password"
SESSION_SECRET="your-32-byte-secret"
NODE_ENV="production"
PORT=3001

# Optional
PRINTER_NAME="ThermalPrinter"          # System printer name
```

### Printer Configuration on Linux

```bash
# Install CUPS
sudo pacman -S cups cups-pdf  # Arch
# or
sudo apt install cups         # Debian/Ubuntu

# Enable CUPS
sudo systemctl enable cups
sudo systemctl start cups

# Add printer (USB)
sudo lpadmin -p ThermalPrinter -E -v usb://Printer/Model -m everywhere

# Add printer (Network)
sudo lpadmin -p ThermalPrinter -E -v ipp://192.168.1.100:631/ipp/print -m everywhere

# Set default printer
sudo lpoptions -d ThermalPrinter

# Test print
echo "Test" | lp -d ThermalPrinter
```

### Printer Configuration on Windows

1. Add printer via Settings → Devices → Printers & Scanners
2. Install manufacturer drivers
3. Set as default printer
4. Test from browser print dialog

---

## Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Browser Print | ✅ Supported | Via `window.print()` |
| PDF Download | ✅ Supported | Via jsPDF |
| 58mm Formatting | ✅ Supported | CSS `@media print` |
| 80mm Formatting | ⚠️ Configurable | Change `@page` width |
| USB Thermal Printers | ✅ Via System | Set as default printer |
| Network Thermal Printers | ✅ Via System | Set as default printer |
| Bluetooth Thermal Printers | ⚠️ Needs Bridge | Requires native app |
| ESC/POS Direct | ❌ Not in Browser | Requires native bridge |
| Barcode Scanners | ✅ Keyboard-Emulation | USB/Bluetooth |
| Advanced Scanner APIs | ⚠️ Needs Implementation | WebHID/WebUSB |
| Thermal Printer Testing | ⚠️ Requires Hardware | Not physically tested |
| Scanner Testing | ⚠️ Requires Hardware | Not physically tested |

---

## Future Improvements

1. **Native Bridge Application:** Electron/Tauri app for direct hardware access
2. **WebHID Scanner Support:** Direct browser API for advanced scanners
3. **ESC/POS Library Integration:** Server-side ESC/POS command generation
4. **Bluetooth Printer Support:** Via native bridge or Web Bluetooth API
5. **Cash Drawer Integration:** Via serial/USB communication
6. **Customer Display:** POS terminal for customer-facing display
7. **Kitchen Display System:** For order management in back office

---

**Last Updated:** 2026-09-25  
**Application Version:** 1.0.0  
**Environment:** Development (SQLite) / Production (PostgreSQL recommended)

---

## Addendum 2026-09-26 — Receipt pipeline rework (what changed, what did not)

### Currently Supported (software-verified 2026-09-26)
- **Browser print (thermal via OS driver)**: `printReceipt()` in `src/lib/receipt.js` opens an 80mm HTML receipt (`buildReceiptHTML()`) in a print window. Any OS-configured 58/80mm printer (USB/network mapped through CUPS) works. Returns `false` when popups are blocked.
- **Real PDF download**: `generateReceiptPDF()` (jsPDF, 80mm format) built from the single authoritative `normalizeReceiptData()` representation; `ReceiptPage` Download button now saves a real `.pdf` via `doc.save()`. Verified by vitest (data-URI + totals assertions).
- **Printer-unavailable fallback**: print returns boolean; UI shows `role="alert"` message directing to Download PDF. Never reports success when the dialog could not open (`OfflinePOSPage` + `ReceiptPage`).
- **Keyboard-emulation scanners** (USB/Bluetooth HID): unchanged — standard text input; no code needed. No WebHID/WebUSB/Web Serial implementation exists.

### Partially Supported / Requires Configuration
- 58mm: CSS `@page`/HTML targets 80mm; 58mm achievable via printer scaling or editing `buildReceiptHTML` widths. 80mm is default.
- Network printers: via OS/CUPS share only. Bluetooth printers: only if OS-exposed as a print target.

### Requires Native Bridge (Not Supported in-browser)
- Direct ESC/POS byte streams, WebUSB/Web Serial printer control, cash drawer kick, customer display. No fake connectivity introduced — nothing claims ESC/POS success.

### Not physically tested (no hardware in this environment)
Thermal printer drivers, ESC/POS output on paper, USB/BT scanner scans, M-Pesa Daraja STK. Record model + firmware + test receipt here before go-live.
