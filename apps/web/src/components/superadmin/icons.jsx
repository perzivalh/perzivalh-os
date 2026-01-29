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

export function XIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path d="M18 6 6 18" strokeWidth="1.8" strokeLinecap="round" />
            <path d="m6 6 12 12" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function LoaderIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function EyeIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function EyeOffIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M14.084 14.158a3 3 0 0 1-4.242-4.242"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="m2 2 20 20" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function SmartphoneIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" strokeWidth="1.8" />
            <path d="M12 18h.01" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function EditIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path
                d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="m15 5 4 4" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function TrashIcon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
            <path d="M3 6h18" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}
