// JSON Serialization Utilities
// Handles serialization and deserialization of objects containing BigInt values
//
// WHY WE NEED THIS:
// 1. JSON spec doesn't support BigInt - only supports numbers up to Number.MAX_SAFE_INTEGER (2^53 - 1)
// 2. JavaScript's JSON.stringify() throws TypeError when encountering BigInt
// 3. PostgreSQL's JSONB follows JSON spec, so it can't store BigInt directly
// 4. Blockchain token amounts are often larger than MAX_SAFE_INTEGER (e.g., 1 ETH = 10^18 wei)
//
// SOLUTION:
// - Before storing: BigInt → string (e.g., 1000000000000000000n → "1000000000000000000")
// - After retrieving: string → BigInt (e.g., "1000000000000000000" → 1000000000000000000n)
//
// This is the standard approach used in blockchain applications for handling token amounts.

/**
 * Convert BigInt values to strings for JSON/database storage
 * Recursively processes objects and arrays to make them JSON-safe
 * 
 * @param obj - Object to convert (can contain BigInt, nested objects, arrays)
 * @returns Object with BigInt values converted to strings
 */
export function convertBigIntToString(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString);
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigIntToString(value);
    }
    return result;
  }
  
  return obj;
}

/**
 * Convert string values back to BigInt for objects from database/JSON
 * Recursively processes objects and arrays to restore proper numeric types
 * Special handling for 'amount' fields which are always converted to BigInt
 * 
 * @param obj - Object from database/JSON (with stringified BigInt values)
 * @returns Object with proper numeric types (BigInt for large numbers)
 */
export function convertStringToBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  // Convert numeric strings to numbers or BigInt
  if (typeof obj === 'string' && /^\d+$/.test(obj)) {
    const num = parseInt(obj);
    // If number is larger than MAX_SAFE_INTEGER, convert to BigInt
    if (num > Number.MAX_SAFE_INTEGER) {
      return BigInt(obj);
    }
    return num;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertStringToBigInt);
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined values
      if (value === undefined) {
        continue;
      }
      
      // Convert amount fields to BigInt (they represent token amounts)
      if (key === 'amount' && typeof value === 'string' && /^\d+$/.test(value)) {
        result[key] = BigInt(value);
      } else if ((key.includes('Amount') || key.includes('amount')) && typeof value === 'string' && /^\d+$/.test(value)) {
        // Also handle fields with 'Amount' in the name (e.g., sourceTokenAmount, destinationTokenAmount)
        result[key] = BigInt(value);
      } else {
        result[key] = convertStringToBigInt(value);
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * Safely stringify an object containing BigInt values
 * This is a convenience wrapper around JSON.stringify with BigInt support
 * 
 * @param obj - Object to stringify
 * @param space - Formatting space (optional)
 * @returns JSON string
 */
export function stringifyWithBigInt(obj: any, space?: number): string {
  return JSON.stringify(convertBigIntToString(obj), null, space);
}

/**
 * Safely parse a JSON string and convert numeric strings to appropriate types
 * This is a convenience wrapper around JSON.parse with BigInt conversion
 * 
 * @param json - JSON string to parse
 * @returns Parsed object with appropriate numeric types
 */
export function parseWithBigInt(json: string): any {
  return convertStringToBigInt(JSON.parse(json));
}

// Keep legacy names for backward compatibility
export const serializeBigInt = convertBigIntToString;
export const deserializeBigInt = convertStringToBigInt;

