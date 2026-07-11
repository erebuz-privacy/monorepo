// Error classes for stealth address operations

/**
 * Base error class for stealth address operations
 */
export class StealthError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly context?: { error?: unknown }
  ) {
    super(message);
    this.name = 'StealthError';
    Object.setPrototypeOf(this, StealthError.prototype);
  }
}

/**
 * Error class for validation failures
 */
export class StealthValidationError extends StealthError {
  constructor(message: string, context?: { error?: unknown }) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'StealthValidationError';
    Object.setPrototypeOf(this, StealthValidationError.prototype);
  }
}

