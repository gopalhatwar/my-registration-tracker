import urllib.request
import json

base_url = "http://127.0.0.1:3000/api/session/update"
sessions_url = "http://127.0.0.1:3000/api/admin/sessions"

def send_update(payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        base_url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

print("1. Sending Step 1 details...")
res1 = send_update({
    "sessionId": "",
    "segment": 1,
    "fields": {
        "name": "John Doe Verification",
        "mobile": "9876543210",
        "email": "john.doe@example.com",
        "city": "Bangalore"
    }
})
session_id = res1.get('sessionId')

print("2. Sending Step 2 details...")
send_update({
    "sessionId": session_id,
    "segment": 2,
    "fields": {
        "currentStatus": "Working Professional",
        "organization": "Imarticus Learning",
        "specialization": "Finance",
        "experience": "1-2",
        "highestQualification": "2024"
    }
})

print("3. Sending Step 3 details...")
send_update({
    "sessionId": session_id,
    "segment": 3,
    "fields": {
        "program": "Chartered Financial Analyst (CFA)",
        "source": "Google Search / Website",
        "courseInfoReceived": "Yes",
        "counselorRating": "5 - Excellent",
        "recommendImarticus": "Yes",
        "mainObjective": "Upskilling / Skill Enhancement"
    }
})

print("4. Sending Step 4 details...")
send_update({
    "sessionId": session_id,
    "segment": 4,
    "fields": {
        "transactionId": "TXN123456789",
        "paymentMethod": "UPI / GPay / PhonePe",
        "terms": True,
        "paymentScreenshot": "data:image/png;base64,iVBOR0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
    }
})

# Retrieve and verify the sessions from admin API
print("\n5. Querying admin API to verify stored session data...")
with urllib.request.urlopen(sessions_url) as response:
    sessions = json.loads(response.read().decode('utf-8'))

found = None
for s in sessions:
    if s.get('id') == session_id:
        found = s
        break

if found:
    print("SUCCESS: Session verified in database!")
    print("Name:", found['fields'].get('name'))
    print("Program:", found['fields'].get('program'))
    print("UTR:", found['fields'].get('transactionId'))
    print("Has Screenshot:", 'paymentScreenshot' in found['fields'])
else:
    print("FAIL: Session was not found in admin API response.")
