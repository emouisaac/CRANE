# SwiftLend API Documentation

## Quick Loan Application Backend

### Base URL
```
Production: https://api.swiftlend.ug/v1
Development: http://localhost:3000/v1
```

### Authentication
All API requests require authentication via JWT tokens in the Authorization header:
```
Authorization: Bearer <access_token>
```

### Response Format
All responses follow a standard format:

**Success Response:**
```json
{
  "success": true,
  "data": { },
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

---

## User Endpoints

### 1. Register User
**POST** `/auth/register`

Request:
```json
{
  "phone": "+2567XXXXXXXX",
  "country": "UG",
  "fullName": "John Doe",
  "dateOfBirth": "1990-01-15",
  "gender": "male"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "referralCode": "SWIFT2024",
    "otpSent": true
  }
}
```

### 2. Verify OTP
**POST** `/auth/verify-otp`

Request:
```json
{
  "phone": "+2567XXXXXXXX",
  "code": "123456"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "id": "uuid",
      "phone": "+2567XXXXXXXX",
      "kycStatus": "pending",
      "creditScore": 0
    }
  }
}
```

### 3. Login
**POST** `/auth/login`

Request:
```json
{
  "phone": "+2567XXXXXXXX",
  "pin": "123456"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 3600
  }
}
```

### 4. Refresh Token
**POST** `/auth/refresh`

Request:
```json
{
  "refreshToken": "eyJhbG..."
}
```

### 5. Get Profile
**GET** `/users/profile`

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "phone": "+2567XXXXXXXX",
    "email": "user@email.com",
    "fullName": "John Doe",
    "kycStatus": "verified",
    "creditScore": 742,
    "loyaltyTier": "gold",
    "totalBorrowed": 2500000,
    "remainingBalance": 1850000
  }
}
```

### 6. Update Profile
**PUT** `/users/profile`

Request:
```json
{
  "fullName": "John Doe",
  "address": "Kampala, Uganda",
  "employmentStatus": "employed",
  "monthlyIncome": 850000
}
```

### 7. Get Credit Score
**GET** `/users/score`

Response:
```json
{
  "success": true,
  "data": {
    "score": 742,
    "grade": "Excellent",
    "factors": {
      "paymentHistory": 92,
      "creditUtilization": 78,
      "accountAge": 85
    },
    "history": [
      { "month": "Jan", "score": 680 },
      { "month": "Feb", "score": 695 }
    ]
  }
}
```

---

## KYC Endpoints

### 8. Upload KYC Documents
**POST** `/kyc/documents`

Request (multipart/form-data):
```
- frontImage: file
- backImage: file
- selfieImage: file
- documentType: national_id
- documentNumber: CFXXXXXXXXXX
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "documents_uploaded",
    "ocrData": {
      "name": "JOHN DOE",
      "dob": "1990-01-15",
      "idNumber": "CFXXXXXXXXXX"
    }
  }
}
```

### 9. Trigger OCR
**POST** `/kyc/ocr/:documentId`

Response:
```json
{
  "success": true,
  "data": {
    "extractedData": {
      "fullName": "JOHN DOE",
      "dateOfBirth": "1990-01-15",
      "idNumber": "CFXXXXXXXXXX"
    },
    "confidence": 0.95
  }
}
```

### 10. Get KYC Status
**GET** `/kyc/status`

Response:
```json
{
  "success": true,
  "data": {
    "status": "verified",
    "level": 4,
    "documents": [
      { "type": "national_id", "status": "verified" }
    ],
    "verifiedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Loan Endpoints

### 11. Apply for Loan
**POST** `/loans/apply`

Request:
```json
{
  "amount": 1200000,
  "term": 6,
  "purpose": "business",
  "disbursementMethod": "mobile_money"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "applicationId": "uuid",
    "aiScore": 742,
    "aiRecommendation": "approve",
    "riskLevel": "low",
    "approvedAmount": 1200000,
    "interestRate": 1.5,
    "monthlyPayment": 220000,
    "totalRepayment": 1320000
  }
}
```

### 12. Get My Loans
**GET** `/loans`

Query Parameters:
- `status`: all, pending, active, completed
- `page`: 1
- `limit`: 10

Response:
```json
{
  "success": true,
  "data": {
    "loans": [
      {
        "id": "uuid",
        "loanNumber": "L2024001",
        "principalAmount": 1200000,
        "remainingBalance": 850000,
        "status": "active",
        "dueDate": "2024-05-15",
        "nextPayment": 220000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5
    }
  }
}
```

### 13. Get Loan Details
**GET** `/loans/:loanId`

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "loanNumber": "L2024001",
    "principalAmount": 1200000,
    "interestRate": 1.5,
    "termMonths": 6,
    "totalAmount": 1320000,
    "remainingBalance": 850000,
    "status": "active",
    "dueDate": "2024-05-15",
    "installments": [
      {
        "number": 1,
        "dueDate": "2024-04-15",
        "amount": 220000,
        "status": "paid"
      }
    ],
    "paymentHistory": [
      {
        "date": "2024-04-15",
        "amount": 220000,
        "method": "mtn_money"
      }
    ]
  }
}
```

### 14. Early Repayment
**POST** `/loans/:loanId/early-repay`

Response:
```json
{
  "success": true,
  "data": {
    "currentBalance": 1200000,
    "earlyRepayAmount": 1155000,
    "savings": 45000,
    "interestSaved": 45000
  }
}
```

### 15. Get Loan Offers
**GET** `/loans/offers`

Response:
```json
{
  "success": true,
  "data": {
    "offers": [
      {
        "id": "uuid",
        "amount": 3000000,
        "term": 6,
        "interestRate": 1.5,
        "monthlyPayment": 550000,
        "totalRepayment": 3300000
      }
    ]
  }
}
```

---

## Payment Endpoints

### 16. Make Payment
**POST** `/payments`

Request:
```json
{
  "loanId": "uuid",
  "amount": 220000,
  "paymentType": "installment",
  "paymentMethod": "mtn_money",
  "mobileMoneyNumber": "+2567XXXXXXXX"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "transactionReference": "TXN20240415001",
    "status": "pending",
    "instructions": "You will receive an STK push on your phone"
  }
}
```

### 17. Get Payment Status
**GET** `/payments/:transactionId`

Response:
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "amount": 220000,
    "processedAt": "2024-04-15T10:30:00Z"
  }
}
```

### 18. Get Payment History
**GET** `/payments/history`

Query Parameters:
- `loanId`: optional
- `page`: 1
- `limit`: 10

### 19. Setup Auto-Debit
**POST** `/payments/autodebit`

Request:
```json
{
  "loanId": "uuid",
  "paymentDay": 15,
  "amount": 220000,
  "paymentMethod": "mtn_money",
  "mobileMoneyNumber": "+2567XXXXXXXX"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "isActive": true,
    "discountPercentage": 5,
    "nextDeduction": "2024-05-15"
  }
}
```

### 20. Cancel Auto-Debit
**DELETE** `/payments/autodebit/:id`

---

## Referral Endpoints

### 21. Get Referral Info
**GET** `/referrals`

Response:
```json
{
  "success": true,
  "data": {
    "referralCode": "SWIFT2024",
    "referralLink": "https://swiftlend.ug/ref/SWIFT2024",
    "totalReferrals": 12,
    "totalEarnings": 450000,
    "pendingEarnings": 150000,
    "levels": [
      { "level": 1, "count": 8, "earnings": 400000 },
      { "level": 2, "count": 4, "earnings": 50000 }
    ]
  }
}
```

### 22. Get Referral List
**GET** `/referrals/list`

Response:
```json
{
  "success": true,
  "data": {
    "referrals": [
      {
        "id": "uuid",
        "user": "John Doe",
        "joinedAt": "2024-01-15",
        "level": 1,
        "earned": 50000,
        "status": "paid"
      }
    ]
  }
}
```

### 23. Withdraw Earnings
**POST** `/referrals/withdraw`

Request:
```json
{
  "amount": 100000,
  "withdrawalMethod": "mtn_money",
  "mobileMoneyNumber": "+2567XXXXXXXX"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "withdrawalId": "uuid",
    "amount": 100000,
    "status": "pending",
    "expectedProcessing": "2024-04-16"
  }
}
```

---

## Notification Endpoints

### 24. Get Notifications
**GET** `/notifications`

Query Parameters:
- `unreadOnly`: true/false
- `page`: 1
- `limit`: 20

### 25. Mark as Read
**PUT** `/notifications/:id/read`

### 26. Mark All as Read
**PUT** `/notifications/read-all`

### 27. Update Preferences
**PUT** `/notifications/preferences`

Request:
```json
{
  "paymentReminders": true,
  "loanUpdates": true,
  "scoreUpdates": true,
  "marketing": false,
  "smsEnabled": true,
  "emailEnabled": true
}
```

---

## Admin Endpoints

### 28. Get All Users
**GET** `/admin/users`

Query Parameters:
- `kycStatus`: pending, verified, rejected
- `page`: 1
- `limit`: 20
- `search`: search term

### 29. Get User Details
**GET** `/admin/users/:userId`

### 30. Approve KYC
**POST** `/admin/users/:userId/kyc/approve`

Request:
```json
{
  "notes": "Documents verified successfully"
}
```

### 31. Reject KYC
**POST** `/admin/users/:userId/kyc/reject`

Request:
```json
{
  "reason": "Document mismatch",
  "notes": "Photo does not match ID"
}
```

### 32. Get All Loans
**GET** `/admin/loans`

Query Parameters:
- `status`: pending, approved, disbursed, repaid, defaulted
- `page`: 1
- `limit`: 20

### 33. Approve Loan
**POST** `/admin/loans/:loanId/approve`

Request:
```json
{
  "notes": "Manual override - verified income"
}
```

### 34. Reject Loan
**POST** `/admin/loans/:loanId/reject`

Request:
```json
{
  "reason": "High risk profile",
  "notes": "Multiple loan applications"
}
```

### 35. Disburse Loan
**POST** `/admin/loans/:loanId/disburse`

Request:
```json
{
  "disbursementMethod": "mtn_money",
  "reference": "DISB20240415001"
}
```

### 36. Get Fraud Alerts
**GET** `/admin/fraud/alerts`

Query Parameters:
- `status`: open, investigating, resolved
- `severity`: low, medium, high

### 37. Resolve Fraud Alert
**POST** `/admin/fraud/alerts/:alertId/resolve`

Request:
```json
{
  "resolution": "false_positive",
  "notes": "Verified as legitimate user"
}
```

### 38. Add to Blacklist
**POST** `/admin/blacklist`

Request:
```json
{
  "userId": "uuid",
  "reason": "Fraudulent activity",
  "isPermanent": true,
  "details": "Multiple fake accounts"
}
```

### 39. Get Blacklist
**GET** `/admin/blacklist`

### 40. Get Audit Logs
**GET** `/admin/audit`

Query Parameters:
- `action`: loan_approval, kyc_verification, etc
- `userId`: optional
- `startDate`: 2024-01-01
- `endDate`: 2024-12-31
- `page`: 1

### 41. Update Scoring Config
**PUT** `/admin/scoring/config`

Request:
```json
{
  "payment_history_weight": 35,
  "credit_utilization_weight": 25,
  "account_age_weight": 15,
  "credit_mix_weight": 10,
  "new_credit_weight": 15,
  "min_approve_score": 550,
  "max_auto_approve_score": 750
}
```

### 42. Get Analytics
**GET** `/admin/analytics`

Response:
```json
{
  "success": true,
  "data": {
    "totalUsers": 12458,
    "activeLoans": 3247,
    "totalDisbursed": 4200000000,
    "defaultRate": 3.2,
    "revenue": {
      "interest": 156000000,
      "fees": 42000000,
      "penalties": 8500000
    },
    "repaymentRate": 72
  }
}
```

### 43. Get Commission Config
**GET** `/admin/commission/config`

### 44. Update Commission Config
**PUT** `/admin/commission/config`

Request:
```json
{
  "levels": [
    { "level": 1, "amount": 50000 },
    { "level": 2, "amount": 25000 }
  ]
}
```

---

## WebSocket Events

### Connection
```javascript
const socket = io('https://api.swiftlend.ug', {
  auth: { token: 'access_token' }
});
```

### Events

**Loan Status Update:**
```javascript
socket.on('loan:status', (data) => {
  // { loanId, status, message }
});
```

**Payment Received:**
```javascript
socket.on('payment:received', (data) => {
  // { loanId, amount, transactionRef }
});
```

**Score Update:**
```javascript
socket.on('score:update', (data) => {
  // { score, change, reason }
});
```

**New Notification:**
```javascript
socket.on('notification:new', (data) => {
  // { id, type, title, message }
});
```

**Fraud Alert:**
```javascript
socket.on('fraud:alert', (data) => {
  // { alertType, severity, description }
});
```

---

## Error Codes

| Code | Description |
|------|-------------|
| AUTH_INVALID | Invalid credentials |
| AUTH_EXPIRED | Token expired |
| AUTH_REQUIRED | Authentication required |
| VALIDATION_ERROR | Invalid input data |
| LOAN_NOT_FOUND | Loan not found |
| LOAN_ALREADY_PAID | Loan already fully paid |
| INSUFFICIENT_BALANCE | Insufficient balance |
| PAYMENT_FAILED | Payment processing failed |
| KYC_PENDING | KYC verification pending |
| KYC_REJECTED | KYC verification rejected |
| USER_BLACKLISTED | User is blacklisted |
| FRAUD_DETECTED | Fraud detected |
| RATE_LIMIT_EXCEEDED | Too many requests |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Auth (login/register) | 5/minute |
| OTP | 10/day |
| Loan Application | 3/day |
| Payment | 10/day |
| General | 100/minute |

---

## Version History

- **v1.0** (2024-01-15) - Initial release
- **v1.1** (2024-03-01) - Added AI scoring endpoints
- **v1.2** (2024-04-01) - Added referral system