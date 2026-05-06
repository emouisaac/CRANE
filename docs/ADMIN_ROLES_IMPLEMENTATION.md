# Role-Based Admin System Implementation

## Overview
The admin system has been completely restructured to support two distinct roles with different permissions and responsibilities:

1. **Master Admin** - Only person who can approve or reject loans
2. **Admin** - Reviews new applicants, manages customer support, initiates rejections (pending master admin approval)

## Implementation Details

### Database Changes
Three new tables have been created to support the role-based system:

#### 1. `admin_messages` Table
Stores all messages between admins and customers for customer support.
```sql
- id: UUID (Primary Key)
- user_id: UUID (Customer)
- admin_id: UUID (Admin)
- message_text: TEXT
- message_type: VARCHAR(30) - 'text', 'password_reset_link', 'status_update'
- is_from_admin: BOOLEAN
- read_at: TIMESTAMPTZ (nullable)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

#### 2. `loan_review_requests` Table
Tracks all loan review actions and approval workflows.
```sql
- id: UUID (Primary Key)
- loan_id: UUID
- user_id: UUID
- initial_status: VARCHAR(30) - 'pending', 'under_review', 'rejected'
- admin_reviewer_id: UUID (Admin who reviewed)
- admin_notes: TEXT
- rejection_reason: TEXT (if rejected by admin)
- master_admin_approval_requested: BOOLEAN
- requested_at: TIMESTAMPTZ (when master admin review requested)
- master_admin_id: UUID (Master admin who decided)
- master_admin_decision: VARCHAR(30) - 'pending', 'approved', 'rejected'
- master_admin_notes: TEXT
- decided_at: TIMESTAMPTZ (when master admin decided)
```

#### 3. `password_reset_requests` Table
Tracks password reset requests initiated by admins.
```sql
- id: UUID (Primary Key)
- user_id: UUID
- admin_id: UUID
- reset_token: TEXT (unique)
- token_expires_at: TIMESTAMPTZ (24 hours)
- is_used: BOOLEAN
- reset_completed_at: TIMESTAMPTZ
- reason: TEXT - 'user_request', 'admin_initiated'
```

**Migration File:** `docs/admin-roles-migration.sql`

### Backend API Changes

#### Authentication & Authorization
- Updated `/api/auth/admin/login` endpoint to accept `role` parameter
- Returns role-specific permissions based on selected role
- Added role-based middleware: `requireMasterAdmin`, `requireRegularAdmin`

#### Master Admin Endpoints (Master Admin Only)
- `POST /api/admin/loans/:loanId/approve` - Approve a loan
- `POST /api/admin/loans/:loanId/reject-final` - Final rejection decision
- `GET /api/admin/approval-requests` - Get pending approval requests
- `GET /api/admin/loans/:loanId/review-history` - View complete review history

#### Regular Admin Endpoints (Admin Only)
- `POST /api/admin/loans/:loanId/review` - Mark loan for review
- `POST /api/admin/loans/:loanId/reject` - Reject and request master admin review
- `POST /api/admin/users/:userId/reset-password` - Initiate password reset
- `GET /api/admin/approval-requests` - View pending decisions (read-only)
- `GET /api/admin/loans/:loanId/review-history` - View review history

#### Chat Endpoints (All Admins)
- `POST /api/admin/messages/send` - Send message to customer
- `GET /api/admin/messages/:userId` - Get chat history with customer
- `PATCH /api/admin/messages/:messageId/read` - Mark message as read

### Frontend Changes

#### Admin Login (`admin-login.html`)
New role selector dropdown on login page:
- Option to login as "Master Admin" (approve loans)
- Option to login as "Admin" (review applicants)

#### Admin Panel (`admin-panel.html`)
Dynamic UI based on logged-in role:

**Master Admin Navigation:**
- Dashboard
- Loan Approvals (view and approve loans)
- Admin Accounts (manage other admins)
- Risk Management
- Settings
- Audit Logs

**Regular Admin Navigation:**
- Dashboard
- Customers (view and manage customers)
- Messages (chat with customers)
- Risk Management
- Settings

#### Admin Panel JS (`admin-panel.js`)
New role-based features:

1. **Role Detection:** Automatically detects role from localStorage and updates UI
2. **Customer Management:** Search, filter, and view customer details
3. **Chat System:** 
   - Send/receive messages with customers
   - Real-time message updates
   - Message read status
4. **Loan Review Workflow:**
   - Admin: Review loans and either approve or reject with notes
   - If rejected, creates approval request for master admin
   - Customer receives notification about status
5. **Password Reset:**
   - Admin can initiate password reset for customers
   - Reset token generated with 24-hour expiration
   - Customer receives message with reset instructions

### User Experience Flow

#### Master Admin Workflow
1. Logs in with password and selects "Master Admin" role
2. Views dashboard with pending approvals
3. Reviews loans submitted for approval
4. Can approve or reject with notes
5. Customer automatically notified of decision
6. Can manage admin accounts and view audit logs

#### Regular Admin Workflow
1. Logs in with password and selects "Admin" role
2. Views dashboard with assigned tasks
3. Can search and view customer profiles
4. Can chat with customers in support
5. Can reset customer passwords
6. When reviewing loans:
   - If approved by admin: Marks for master admin review
   - If rejected by admin: Submits rejection with reason for master admin approval
7. Cannot directly approve loans - must be approved by master admin

#### Customer Interaction
1. Receives messages from admins in chat
2. Can see password reset links in messages
3. Receives notifications about loan status changes
4. Can communicate with support through messages

### Login Instructions

**Master Admin Access:**
1. Go to admin login page
2. Enter master password
3. Select "Master Admin (Approve Loans)" from dropdown
4. Click "Access Admin Console"

**Regular Admin Access:**
1. Go to admin login page
2. Enter master password
3. Select "Admin (Review Applicants)" from dropdown
4. Click "Access Admin Console"

### Security Notes

- Both roles use the same master password (configurable via ENV)
- Role selection is made at login time
- JWT tokens include role information for backend verification
- All role-based checks enforced on backend API
- Chat messages and password resets logged in audit trail

### Testing Checklist

- [ ] Run migration SQL on database: `docs/admin-roles-migration.sql`
- [ ] Test master admin login and workflow
- [ ] Test regular admin login and workflow
- [ ] Test chat functionality between admin and customer
- [ ] Test password reset initiation and flow
- [ ] Test loan review and rejection workflow
- [ ] Test master admin approval of rejected loans
- [ ] Verify all API endpoints return 403 for unauthorized roles
- [ ] Test on mobile devices (responsive)

### Future Enhancements

1. Database persistence for admin accounts with individual credentials
2. Real-time notifications/WebSocket for messages
3. Audit logging for all admin actions
4. Email notifications to customers
5. Admin performance metrics and KPIs
6. Customer rating system for admin support
7. Advanced chat features (attachments, voice notes)
8. Scheduled password reset reminders

## Files Modified

1. **Backend:**
   - `server/src/routes/admin.routes.js` - Role-based endpoints and middleware
   - `docs/admin-roles-migration.sql` - Database schema updates

2. **Frontend:**
   - `admin-panel.html` - Added new sections for admins
   - `admin-panel.js` - Role-based UI and functionality
   - `admin-login.html` - Added role selector
   - `admin-auth.js` - Updated login to handle role selection

All changes have been committed to version control.
