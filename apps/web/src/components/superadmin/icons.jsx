/**
 * Iconos de SuperAdminView
 */
import React from "react";

export function GridIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect x="4" y="4" width="6" height="6" rx="1.5" strokeWidth="1.6" />
            <rect x="14" y="4" width="6" height="6" rx="1.5" strokeWidth="1.6" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" strokeWidth="1.6" />
            <rect x="14" y="14" width="6" height="6" rx="1.5" strokeWidth="1.6" />
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

export function GearIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="12" cy="12" r="3.5" strokeWidth="1.6" />
            <path
                d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.7a7.2 7.2 0 0 0-2-1.2L12 2 9.5 4.3a7.2 7.2 0 0 0-2 1.2l-2.4-.7-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.7a7.2 7.2 0 0 0 2 1.2L12 22l2.5-2.3a7.2 7.2 0 0 0 2-1.2l2.4.7 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z"
                strokeWidth="1.2"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function SearchIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <circle cx="11" cy="11" r="6.5" strokeWidth="1.6" />
            <path d="M16.5 16.5 20 20" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

export function ArrowRightIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path d="M6 12h12" strokeWidth="1.8" strokeLinecap="round" />
            <path d="m13 6 6 6-6 6" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}
