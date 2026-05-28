# Sending HEX Files to Hardware with CoolTerm

Debug80 can send the selected target's built Intel HEX file to a real TEC-1 board through
CoolTerm. CoolTerm owns the serial port; Debug80 controls CoolTerm through its localhost Remote
Control Socket.

## 1. Install CoolTerm

Download CoolTerm from the official site:

<https://freeware.the-meiers.org>

On macOS, Apple may show:

```text
"CoolTerm" Not Opened.
Apple could not verify "CoolTerm" is free of malware.
```

If you trust the download source, open **System Settings > Privacy & Security**, scroll to the
Security section, and choose **Open Anyway** for CoolTerm. You can also right-click CoolTerm in
Finder, choose **Open**, and confirm.

## 2. Enable the Remote Control Socket

In CoolTerm:

1. Open **Preferences**.
2. Open **Scripting**.
3. Enable **Remote Control Socket**.
4. Keep the port set to `51413`.
5. Leave **HTTP Server** disabled.
6. AppleScript is not needed.

Debug80 connects to `127.0.0.1:51413`. If CoolTerm is running and the socket is enabled, Debug80
detects it automatically.

## 3. Configure the TEC-1 Serial Connection

In CoolTerm's connection options, select the serial port for your USB serial adapter and use the
TEC-1 monitor settings:

```text
4800 baud
8 data bits
No parity
2 stop bits
```

If the board needs pacing, configure CoolTerm's transmit delay options. Debug80 sends the selected
HEX file through CoolTerm, so CoolTerm's raw file sending and pacing settings are the ones that
matter.

## 4. Send from Debug80

1. Select the Debug80 project folder.
2. Select the target.
3. Build the target so its `.hex` file exists in the build folder.
4. On the TEC-1G, choose **Intel HEX Load** so MON3 is waiting for the first `:` record.
5. Click **Send to Board** in Debug80.

Debug80 sends the selected target's HEX file through CoolTerm. MON3 does not send a serial
`PASSED` or `FAILED` response when the load finishes. Instead, check the TEC-1G seven-segment
display:

```text
PASS   load accepted
ERROR  checksum or write verification failed
```

If the HEX file is missing, build the target first. If the button is not visible, CoolTerm is not
currently detected on the Remote Control Socket.
