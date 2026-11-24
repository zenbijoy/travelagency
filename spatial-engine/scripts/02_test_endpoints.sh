#!/bin/bash
# ==============================================================================
# scripts/02_test_endpoints.sh
# Acceptance Test Suite for ShopnoJatra Autonomous Map API
# ==============================================================================
set -e

HOST="http://localhost:8080"
API_KEY="dev_key_12345"

echo "==> 1. Testing Health Endpoint..."
curl -s "$HOST/healthz" | jq .

echo "==> 2. Testing Places Autocomplete (Query: Dhanmondi)..."
curl -s -H "X-API-Key: $API_KEY" "$HOST/v1/places/autocomplete?input=Dhanmondi&lat=23.7465&lng=90.3760" | jq .

echo "==> 3. Testing Reverse Geocoding (Banani Coords)..."
curl -s -H "X-API-Key: $API_KEY" "$HOST/v1/geocode/reverse?lat=23.7925&lng=90.4078" | jq .

echo "==> 4. Testing Directions & ETA (Gulshan 1 to Airport Road - Motorbike)..."
curl -s -H "X-API-Key: $API_KEY" "$HOST/v1/directions?origin=23.7781,90.4172&destination=23.8512,90.4088&mode=motorbike" | jq .

echo "==> 5. Testing Uber H3 Surge Engine (Resolution 8)..."
curl -s -H "X-API-Key: $API_KEY" "$HOST/v1/surge?lat=23.7925&lng=90.4078" | jq .

echo "==> 6. Testing Centrifugo JWT Generation..."
curl -s -H "X-API-Key: $API_KEY" "$HOST/v1/auth/token?user_id=rider_8801700000000" | jq .

echo "==> All Tests Completed Successfully!"
