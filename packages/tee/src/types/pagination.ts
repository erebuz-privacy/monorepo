// Pagination Types

/**
 * Options for pagination
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

/**
 * Paginated result with metadata
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

