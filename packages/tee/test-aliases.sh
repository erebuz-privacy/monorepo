#!/bin/bash

# Test script for alias endpoints
BASE_URL="http://localhost:3000"

echo "Testing alias endpoints..."
echo "========================="
echo ""

# Test 1: GET /get/:name (alias for /api/user/get/:name)
echo "Test 1: GET /get/testname (alias endpoint)"
curl -s -X GET "${BASE_URL}/get/testname" -H "Content-Type: application/json" | jq '.' || echo "Response received"
echo ""
echo ""

# Test 2: GET /api/user/get/:name (original endpoint)
echo "Test 2: GET /api/user/get/testname (original endpoint)"
curl -s -X GET "${BASE_URL}/api/user/get/testname" -H "Content-Type: application/json" | jq '.' || echo "Response received"
echo ""
echo ""

# Test 3: POST /set (alias for /api/user/register)
echo "Test 3: POST /set (alias endpoint) - testing with minimal data"
curl -s -X POST "${BASE_URL}/set" \
  -H "Content-Type: application/json" \
  -d '{
    "ensData": {
      "ensUsername": "test.eth",
      "eoaAddress": "0x1234567890123456789012345678901234567890"
    },
    "supportedChains": [],
    "modules": [],
    "privacyEnabled": false,
    "eigenAiEnabled": false,
    "signature": {
      "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "expiration": 9999999999
    }
  }' | jq '.' || echo "Response received"
echo ""
echo ""

# Test 4: POST /api/user/register (original endpoint)
echo "Test 4: POST /api/user/register (original endpoint) - testing with minimal data"
curl -s -X POST "${BASE_URL}/api/user/register" \
  -H "Content-Type: application/json" \
  -d '{
    "ensData": {
      "ensUsername": "test2.eth",
      "eoaAddress": "0x1234567890123456789012345678901234567890"
    },
    "supportedChains": [],
    "modules": [],
    "privacyEnabled": false,
    "eigenAiEnabled": false,
    "signature": {
      "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "expiration": 9999999999
    }
  }' | jq '.' || echo "Response received"
echo ""
echo ""

echo "========================="
echo "Tests completed!"



