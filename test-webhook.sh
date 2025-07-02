#!/bin/bash

echo "🧪 Testing FlowClip N8N Webhook..."
echo "=================================="

# Test the hotel research webhook
curl -X POST http://localhost:5678/webhook/flowclip-hotel-research \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-hotel-001",
    "sessionType": "hotel_research",
    "itemCount": 3,
    "hotelData": {
      "hotelNames": ["Hilton Toronto Downtown", "The Ritz-Carlton Toronto", "Shangri-La Hotel Toronto"],
      "locations": ["Toronto, Canada"],
      "checkInDates": ["2024-07-15", "2024-07-17"]
    }
  }'

echo ""
echo ""
echo "✅ If you see JSON response above, the webhook is working!"
echo "❌ If you see error, the workflow isn't created or active yet." 