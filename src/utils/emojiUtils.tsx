import React from 'react';

// Inline SVGs for the requested icons to ensure they work on Windows without external assets
const SwissFlag = () => (
    <svg viewBox="0 0 32 32" width="20" height="20" aria-label="Switzerland" role="img">
        <rect width="32" height="32" fill="#FF0000" rx="4" />
        <rect x="13" y="6" width="6" height="20" fill="#FFFFFF" />
        <rect x="6" y="13" width="20" height="6" fill="#FFFFFF" />
    </svg>
);

const ItalianFlag = () => (
    <svg viewBox="0 0 32 32" width="20" height="20" aria-label="Italy" role="img">
        <rect width="32" height="32" fill="#FFFFFF" rx="4" />
        <path d="M0 4C0 1.79 1.79 0 4 0H10.6V32H4C1.79 32 0 30.2 0 28V4Z" fill="#009246" />
        <rect x="10.6" y="0" width="10.8" height="32" fill="#FFFFFF" />
        <path d="M21.4 0H28C30.2 0 32 1.79 32 4V28C32 30.2 30.2 32 28 32H21.4V0Z" fill="#CE2B37" />
    </svg>
);

const WarningIcon = () => (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-label="Warning" role="img">
        <path d="M16 2L2 28H30L16 2Z" fill="#F4B400" stroke="#000" strokeWidth="1" strokeLinejoin="round" />
        <path d="M16 10V20" stroke="#000" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="25" r="2" fill="#000" />
    </svg>
);

const QuestionIcon = () => (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-label="Question" role="img">
        <circle cx="16" cy="16" r="14" fill="#666" />
        <path d="M12 10C12 7 14 5 16 5C19 5 21 7 21 10C21 12 19 13 18 14C17 15 16 16 16 18V19" stroke="#FFF" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="16" cy="24" r="2" fill="#FFF" />
    </svg>
);

export const renderCustomEmoji = (text: string) => {
    const trimmed = text.trim();
    // Check specific emojis requested
    // 🇨🇭 Switzerland
    if (trimmed === '🇨🇭' || trimmed === 'CH') return <SwissFlag />;
    // 🇮🇹 Italy
    if (trimmed === '🇮🇹' || trimmed === 'IT') return <ItalianFlag />;
    // ⚠️ Warning
    if (trimmed === '⚠️' || trimmed.toLowerCase() === 'warning') return <WarningIcon />;
    // ❓ Question
    if (trimmed === '❓' || trimmed === '?') return <QuestionIcon />;

    // Return text if no match
    return <span>{text}</span>;
}
