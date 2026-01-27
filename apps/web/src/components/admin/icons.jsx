/**
 * Iconos usados en AdminView
 */
import React from "react";

export function SlidersIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <line x1="4" y1="6" x2="20" y2="6" strokeWidth="2" />
            <circle cx="9" cy="6" r="2" strokeWidth="2" />
            <line x1="4" y1="12" x2="20" y2="12" strokeWidth="2" />
            <circle cx="15" cy="12" r="2" strokeWidth="2" />
            <line x1="4" y1="18" x2="20" y2="18" strokeWidth="2" />
            <circle cx="11" cy="18" r="2" strokeWidth="2" />
        </svg>
    );
}

export function UsersIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="9" cy="8" r="3" strokeWidth="2" />
            <path d="M4 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" strokeWidth="2" />
            <circle cx="17" cy="9" r="2" strokeWidth="2" />
            <path d="M14 20c0-1.8 1.4-3.4 3.2-4" strokeWidth="2" />
        </svg>
    );
}

export function BotIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect x="5" y="7" width="14" height="10" rx="2" strokeWidth="2" />
            <circle cx="9" cy="12" r="1" strokeWidth="2" />
            <circle cx="15" cy="12" r="1" strokeWidth="2" />
            <line x1="12" y1="4" x2="12" y2="7" strokeWidth="2" />
        </svg>
    );
}

export function TemplateIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect x="6" y="4" width="12" height="16" rx="2" strokeWidth="2" />
            <line x1="9" y1="9" x2="15" y2="9" strokeWidth="2" />
            <line x1="9" y1="13" x2="15" y2="13" strokeWidth="2" />
        </svg>
    );
}

export function AuditIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect x="6" y="5" width="12" height="15" rx="2" strokeWidth="2" />
            <path d="M9 5h6" strokeWidth="2" />
            <path d="M9 10h6" strokeWidth="2" />
            <path d="M9 14h6" strokeWidth="2" />
        </svg>
    );
}

export function PuzzleIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M8 4h4a2 2 0 1 1 0 4h-1v2h2a2 2 0 1 1 0 4h-2v2H8a2 2 0 1 1-4 0V8a2 2 0 1 1 4 0z"
                strokeWidth="2"
            />
        </svg>
    );
}
