#!/bin/bash

# Step-by-step test runner for user-api integration tests

echo "=========================================="
echo "User API Integration Test Runner"
echo "=========================================="
echo ""
echo "Available test groups:"
echo "1. GET /api/user/get/:name (4 tests)"
echo "2. GET /api/user/list (10 tests)"
echo "3. GET /get/:name (alias) (2 tests)"
echo "4. POST /set (alias for register) (2 tests)"
echo "5. Run all tests"
echo ""
read -p "Select test group to run (1-5): " choice

case $choice in
  1)
    echo "Running: GET /api/user/get/:name"
    bun test tests/integration/user-api.test.ts --test-name-pattern="GET /api/user/get/:name"
    ;;
  2)
    echo "Running: GET /api/user/list"
    bun test tests/integration/user-api.test.ts --test-name-pattern="GET /api/user/list"
    ;;
  3)
    echo "Running: GET /get/:name (alias)"
    bun test tests/integration/user-api.test.ts --test-name-pattern="GET /get/:name"
    ;;
  4)
    echo "Running: POST /set (alias for register)"
    bun test tests/integration/user-api.test.ts --test-name-pattern="POST /set"
    ;;
  5)
    echo "Running all tests"
    bun test tests/integration/user-api.test.ts
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

