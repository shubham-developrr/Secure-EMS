import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StudentTerminal from '../src/StudentTerminal.jsx';

describe('StudentTerminal Android & Kiosk Anti-Cheat Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    // Mock Native Android SecureKioskBridge
    window.SecureKioskBridge = {
      enableKioskMode: vi.fn(() =>
        JSON.stringify({
          platform: 'android',
          kioskExamActive: true,
          flagSecureEnabled: true,
          immersiveFullscreen: true,
          multiWindowBlocked: true,
          overlayProtectionEnabled: true,
          isLockTaskActive: true,
          lockTaskMode: 'DEVICE_OWNER_LOCKED',
          batteryLevel: 94,
          networkType: 'WIFI',
        })
      ),
      disableKioskMode: vi.fn(() => true),
      exitKioskApp: vi.fn(() => true),
      getKioskStatus: vi.fn(() =>
        JSON.stringify({
          platform: 'android',
          kioskExamActive: false,
          flagSecureEnabled: true,
          immersiveFullscreen: true,
          multiWindowBlocked: true,
          overlayProtectionEnabled: true,
          isLockTaskActive: true,
          lockTaskMode: 'SCREEN_PINNED',
          batteryLevel: 94,
          networkType: 'WIFI',
        })
      ),
      clearClipboard: vi.fn(),
      setOrientationLock: vi.fn(),
    };

    global.fetch = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/student/verification/')) {
        return {
          ok: true,
          json: async () => ({
            verified: true,
            captured_image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          }),
        };
      }
      if (urlStr.includes('/api/student/paper')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            content: 'SECTION A: Q1. Explain Android LockTask Mode and FLAG_SECURE.',
            captured_image_base64: null,
          }),
        };
      }
      if (urlStr.includes('/api/student/heartbeat')) {
        return {
          ok: true,
          json: async () => ({ status: 'acknowledged' }),
        };
      }
      if (urlStr.includes('/api/student/security-alert')) {
        return {
          ok: true,
          json: async () => ({ status: 'recorded' }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });
  });

  afterEach(() => {
    delete window.SecureKioskBridge;
  });

  it('renders Android Kiosk security telemetry badges and hardware checklist without server config UI', async () => {
    render(<StudentTerminal />);

    expect(screen.getByText(/STUDENT SECURE KIOSK TERMINAL/i)).toBeInTheDocument();
    expect(screen.getByText(/🛡️ FLAG_SECURE/i)).toBeInTheDocument();
    expect(screen.getByText(/SPLIT-SCREEN: BLOCKED/i)).toBeInTheDocument();
    expect(screen.getByText(/6\/6 READY/i)).toBeInTheDocument();
    expect(screen.queryByText(/Configure Server/i)).not.toBeInTheDocument();
  });

  it('activates native Android LockTask kiosk mode on login and displays decrypted paper with forensic watermark', async () => {
    render(<StudentTerminal />);

    const subjectInput = screen.getByPlaceholderText('CS-602');
    fireEvent.change(subjectInput, { target: { value: 'CS-602' } });

    fireEvent.click(screen.getByRole('button', { name: /START SECURE KIOSK READER/i }));

    await waitFor(() => {
      expect(screen.getByText(/SECURE STUDENT KIOSK READER — ACTIVE/i)).toBeInTheDocument();
    });

    expect(window.SecureKioskBridge.enableKioskMode).toHaveBeenCalled();
    expect(screen.getByText(/Explain Android LockTask Mode and FLAG_SECURE/i)).toBeInTheDocument();
    expect(screen.getByText(/SECURITY VIOLATIONS: 0/i)).toBeInTheDocument();
  });

  it('detects Android Screen Pinning breach, suspends paper view, and reports violation to backend', async () => {
    render(<StudentTerminal />);

    fireEvent.change(screen.getByPlaceholderText('CS-602'), { target: { value: 'CS-602' } });
    fireEvent.click(screen.getByRole('button', { name: /START SECURE KIOSK READER/i }));

    await waitFor(() => {
      expect(screen.getByText(/SECURE STUDENT KIOSK READER — ACTIVE/i)).toBeInTheDocument();
    });

    // Simulate native Android LockTask / Screen Pinning breach event from MainActivity.java
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('nativeKioskViolation', {
          detail: {
            violationType: 'SCREEN_PINNING_BREACH',
            details: 'Student unpinned Android screen lock.',
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/ANDROID SCREEN PINNING BREACHED/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/SECURITY VIOLATIONS: 1/i)).toBeInTheDocument();

    // Verify alert was sent to backend
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/student/security-alert'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('SCREEN_PINNING_BREACH'),
      })
    );

    // Click Re-Pin button to resume session
    fireEvent.click(screen.getByRole('button', { name: /RE-PIN SCREEN & RESUME SECURE SESSION/i }));

    await waitFor(() => {
      expect(screen.queryByText(/ANDROID SCREEN PINNING BREACHED/i)).not.toBeInTheDocument();
    });

    // Simulate external HDMI / Wireless Cast display detection
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('nativeKioskViolation', {
          detail: {
            violationType: 'SECONDARY_DISPLAY_DETECTED',
            details: 'External HDMI display attached.',
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/EXTERNAL DISPLAY \/ SCREEN CAST DETECTED/i)).toBeInTheDocument();
    });
  });

  it('blocks 3-finger screenshot touch gestures and reports SUSPICIOUS_TOUCH_GESTURE', async () => {
    render(<StudentTerminal />);

    fireEvent.change(screen.getByPlaceholderText('CS-602'), { target: { value: 'CS-602' } });
    fireEvent.click(screen.getByRole('button', { name: /START SECURE KIOSK READER/i }));

    await waitFor(() => {
      expect(screen.getByText(/SECURE STUDENT KIOSK READER — ACTIVE/i)).toBeInTheDocument();
    });

    fireEvent.touchStart(window, {
      touches: [{ clientX: 10, clientY: 10 }, { clientX: 20, clientY: 20 }, { clientX: 30, clientY: 30 }],
    });

    await waitFor(() => {
      expect(screen.getByText(/SECURITY VIOLATIONS: 1/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/student/security-alert'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('SUSPICIOUS_TOUCH_GESTURE'),
      })
    );
  });

  it('opens Admin Override modal after 5 rapid taps on header status badge and exits with PIN 999', async () => {
    render(<StudentTerminal />);

    const onlineBadge = screen.getByRole('button', { name: /CLIENT ONLINE/i });
    for (let i = 0; i < 5; i++) {
      fireEvent.click(onlineBadge);
    }

    expect(screen.getByText(/Admin override/i)).toBeInTheDocument();

    const pinInput = screen.getByPlaceholderText('***');
    fireEvent.change(pinInput, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'EXIT' }));

    await waitFor(() => {
      expect(window.SecureKioskBridge.exitKioskApp).toHaveBeenCalledWith('999');
    });
  });
});
