/**
 * Iconos SVG reutilizables
 */

import React from "react";

export function ChatIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M4.5 5.5h15v10H8l-3.5 3.5V5.5Z"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <path d="M8 9h8" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 12.5h5" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function DashboardIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect x="3" y="3" width="7" height="7" rx="1.6" strokeWidth="1.8" />
            <rect x="14" y="3" width="7" height="7" rx="1.6" strokeWidth="1.8" />
            <rect x="3" y="14" width="7" height="7" rx="1.6" strokeWidth="1.8" />
            <rect x="14" y="14" width="7" height="7" rx="1.6" strokeWidth="1.8" />
        </svg>
    );
}

export function BellIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M6 9a6 6 0 1 1 12 0c0 4.2 2 5.5 2 5.5H4S6 13.2 6 9Z"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeWidth="1.8" />
        </svg>
    );
}

export function SettingsIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="3" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function SunIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
            <path d="M12 3v2.5" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 18.5V21" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 12h2.5" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M18.5 12H21" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M5.2 5.2l1.8 1.8" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17 17l1.8 1.8" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M5.2 18.8 7 17" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17 7l1.8-1.8" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function MoonIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M20 14.2A8.5 8.5 0 1 1 9.8 4 6.5 6.5 0 0 0 20 14.2Z"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function UserIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="12" cy="8" r="3.5" strokeWidth="1.8" />
            <path
                d="M5 19.5a7 7 0 0 1 14 0"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

export function SearchIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="11" cy="11" r="6.5" strokeWidth="1.8" />
            <path d="M16.5 16.5 21 21" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function PlusIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path d="M12 5v14" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M5 12h14" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function VideoIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect x="3.5" y="6" width="11" height="12" rx="2" strokeWidth="1.8" />
            <path d="m14.5 10 6-3v10l-6-3" strokeWidth="1.8" />
        </svg>
    );
}

export function PhoneIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M6.5 4.5 9 3l2.5 4-2.5 1.5c1.2 2.3 3.2 4.3 5.5 5.5L16 11l4 2.5-1.5 2.5c-.7 1.2-2.2 1.7-3.6 1.3a15.9 15.9 0 0 1-7.7-7.7c-.4-1.4.1-2.9 1.3-3.6Z"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function InfoIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
            <path d="M12 10v6" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="7.5" r="1" fill="currentColor" />
        </svg>
    );
}

export function SendIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="m4 12 15-7-6 14-2.5-5.2L4 12Z"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    );
}
