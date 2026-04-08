const MAX_ERROR_MESSAGE_LENGTH = 140;

const normaliseMessage = (message: string): string => message.replace(/\s+/g, ' ').trim();

const truncateMessage = (message: string, maxLength = MAX_ERROR_MESSAGE_LENGTH): string => {
    if (message.length <= maxLength) {
        return message;
    }

    return `${message.slice(0, maxLength - 3).trimEnd()}...`;
};

export const getUserFacingErrorMessage = (error: unknown, fallbackMessage: string): string => {
    if (!(error instanceof Error)) {
        return fallbackMessage;
    }

    const normalised = normaliseMessage(error.message);
    if (!normalised) {
        return fallbackMessage;
    }

    return truncateMessage(normalised);
};
