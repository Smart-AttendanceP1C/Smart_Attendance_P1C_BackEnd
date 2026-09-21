# Smart Attendance API Contract

## Base URL

/api/v1

## 1. Authentication

### Login

POST /api/v1/auth/login

#### Request Body

```json
{
  "email": "student@example.com",
  "password": "123456"
}
```
#### Success Response

```json
{
  "success": true,
  "data": {
    "access_token": "JWT_TOKEN",
    "user": {
      "id": 1,
      "name": "Sara Mohamed",
      "email": "sara@example.com",
      "role": "student"
    }
  }
}
```
#### Error Response — Invalid Credentials

HTTP Status: 401 Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```
#### Error Response — Validation Error

HTTP Status: 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email and password are required"
  }
}
```
## Authentication

Protected endpoints require:

Authorization: Bearer <access_token>

## 2. Courses

### List Courses

GET /api/v1/courses

#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "course_code": "AI301",
      "name": "Machine Learning"
    },
    {
      "id": 2,
      "course_code": "DB302",
      "name": "Database Systems"
    }
  ]
}
```
#### Error Response — Internal Server Error

**HTTP Status:** 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

## 3. Sections

### List Sections

GET /api/v1/sections
#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "course_id": 1,
      "section_code": "A",
      "semester": "Fall",
      "academic_year": "2026/2027"
    }
  ]
}
```

#### Error Response — Internal Server Error

**HTTP Status:** 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```
## 4. Enrollment

### List Enrolled Students

GET /api/v1/sections/{sectionId}/students

#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "student_code": "20230125",
      "name": "Sara Mohamed"
    },
    {
      "id": 2,
      "student_code": "20230126",
      "name": "Ahmed Ali"
    }
  ]
}
```

#### Error Response — Section Not Found

**HTTP Status:** 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "SECTION_NOT_FOUND",
    "message": "Section not found"
  }
}
```

#### Error Response — Internal Server Error

**HTTP Status:** 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```
## 5. Timetable

### List Timetable 

GET /api/v1/timetable

#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "section_id": 1,
      "room_id": 2,
      "day_of_week": "Sunday",
      "start_time": "10:00",
      "end_time": "12:00"
    }
  ]
}
```

#### Error Response — Internal Server Error

**HTTP Status:** 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```
## 6. Attendance Sessions

### Open Attendance Session

POST /api/v1/attendance/sessions

#### Authentication

Required

#### Request Body

```json
{
  "timetable_id": 1
}
```

#### Success Response

**HTTP Status:** 201 Created

```json
{
  "success": true,
  "data": {
    "id": 15,
    "timetable_id": 1,
    "status": "open",
    "started_at": "2026-09-20T10:00:00Z"
  }
}
```

#### Error Response — Unauthorized Role

**HTTP Status:** 403 Forbidden

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not allowed to open an attendance session"
  }
}
```

#### Error Response — Invalid Schedule

**HTTP Status:** 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SCHEDULE",
    "message": "Attendance session cannot be opened for this timetable slot"
  }
}
```

#### Error Response — Internal Server Error

**HTTP Status:** 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```
### Close Attendance Session

PATCH /api/v1/attendance/sessions/{sessionId}/close

#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": {
    "id": 15,
    "status": "closed",
    "ended_at": "2026-09-20T12:00:00Z"
  }
}
```

#### Error Response — Session Not Found

**HTTP Status:** 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Attendance session not found"
  }
}
```

#### Error Response — Forbidden

**HTTP Status:** 403 Forbidden

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not allowed to close this attendance session"
  }
}
```
## 7. QR Attendance

### Get Active QR Token

GET /api/v1/attendance/sessions/{sessionId}/qr

#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": {
    "session_id": 15,
    "token": "SIGNED_QR_TOKEN",
    "expires_at": "2026-09-20T10:00:10Z"
  }
}
```

#### Error Response — Session Not Found

**HTTP Status:** 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Attendance session not found"
  }
}
```

#### Error Response — Session Closed

**HTTP Status:** 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "SESSION_CLOSED",
    "message": "The attendance session is closed"
  }
}
```
### Scan QR

POST /api/v1/attendance/scan

#### Authentication

Required

#### Request Body

```json
{
  "token": "SIGNED_QR_TOKEN"
}
```

#### Success Response

**HTTP Status:** 201 Created

```json
{
  "success": true,
  "data": {
    "attendance_event_id": 101,
    "session_id": 15,
    "status": "accepted",
    "scanned_at": "2026-09-20T10:03:25Z"
  }
}
```

#### Error Response — Expired QR

**HTTP Status:** 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "QR_EXPIRED",
    "message": "The QR code has expired"
  }
}
```

#### Error Response — Invalid QR

**HTTP Status:** 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QR",
    "message": "The QR code is invalid"
  }
}
```

#### Error Response — Not Enrolled

**HTTP Status:** 403 Forbidden

```json
{
  "success": false,
  "error": {
    "code": "NOT_ENROLLED",
    "message": "You are not enrolled in this section"
  }
}
```

#### Error Response — Duplicate Attendance

**HTTP Status:** 409 Conflict

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ATTENDANCE",
    "message": "Attendance has already been recorded for this session"
  }
}
```
## 8. Attendance Roster

### Get Attendance Roster

GET /api/v1/attendance/sessions/{sessionId}/roster

#### Authentication
Required

#### Request Body
None

#### Success Response
**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "student_id": 1,
      "student_code": "20230125",
      "name": "Sara Mohamed",
      "attendance_status": "present",
      "scanned_at": "2026-09-20T10:03:25Z"
    },
    {
      "student_id": 2,
      "student_code": "20230126",
      "name": "Ahmed Ali",
      "attendance_status": "absent",
      "scanned_at": null
    }
  ]
}
```
#### Error Response — Session Not Found

**HTTP Status:** 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Attendance session not found"
  }
}
```
#### Error Response — Forbidden

**HTTP Status:** 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not allowed to view this attendance session"
  }
}
```
## 9. Manual Attendance Correction

### Update Student Attendance

PATCH /api/v1/attendance/sessions/{sessionId}/students/{studentId}

#### Authentication

Required

#### Request Body

```json
{
  "attendance_status": "present",
  "reason": "Student was present but QR scan failed"
}
```
#### Success Response

**HTTP Status:** 200 OK
```json
{
  "success": true,
  "data": {
    "student_id": 2,
    "session_id": 15,
    "attendance_status": "present",
    "reason": "Student was present but QR scan failed",
    "updated_at": "2026-09-20T10:15:00Z"
  }
}
```
#### Error Response — Session Not Found

**HTTP Status:** 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Attendance session not found"
  }
}
```
#### Error Response — Student Not Found

**HTTP Status:** 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "STUDENT_NOT_FOUND",
    "message": "Student not found"
  }
}
```
#### Error Response — Forbidden

**HTTP Status:** 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not allowed to modify attendance"
  }
}
```
#### Error Response — Missing Reason

**HTTP Status:** 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Reason is required for manual attendance correction"
  }
}
```
## 10. Student Attendance Records

### Get My Attendance Records

GET /api/v1/students/me/attendance

#### Authentication

Required

#### Request Body

None

#### Success Response

**HTTP Status:** 200 OK

```json
{
  "success": true,
  "data": [
    {
      "session_id": 15,
      "course_code": "AI301",
      "course_name": "Machine Learning",
      "attendance_status": "present",
      "scanned_at": "2026-09-20T10:03:25Z"
    },
    {
      "session_id": 16,
      "course_code": "DB302",
      "course_name": "Database Systems",
      "attendance_status": "absent",
      "scanned_at": null
    }
  ]
}
```
#### Error Response — Forbidden

**HTTP Status:** 403 Forbidden

```json

{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not allowed to view these attendance records"
  }
}
```
#### Error Response — Internal Server Error

**HTTP Status:** 500 Internal Server Erro

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```
## 11. Attendance Correction Requests

### Submit Correction Request

POST /api/v1/attendance/correction-requests

#### Authentication

Required: Bearer Token

Only authenticated students can submit correction requests for their own attendance records.

#### Request Body

```json
{
  "attendance_event_id": 101,
  "evidence": "I was present in the classroom, but the QR code did not scan on my phone."
}
```

#### Success Response

**HTTP Status: 201 Created**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "attendance_event_id": 101,
    "evidence": "I was present in the classroom, but the QR code did not scan on my phone.",
    "status": "pending"
  }
}
```

#### Error Response — Attendance Event Not Found

**HTTP Status: 404 Not Found**

```json
{
  "success": false,
  "error": {
    "code": "ATTENDANCE_EVENT_NOT_FOUND",
    "message": "Attendance event not found."
  }
}
```

#### Error Response — Forbidden

**HTTP Status: 403 Forbidden**

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You can only submit correction requests for your own attendance records."
  }
}
```

#### Error Response — Missing Evidence

**HTTP Status: 400 Bad Request**

```json
{
  "success": false,
  "error": {
    "code": "MISSING_EVIDENCE",
    "message": "Evidence is required."
  }
}
```
### Review Correction Request

PATCH /api/v1/attendance/correction-requests/{requestId}

#### Authentication

Required: Bearer Token

Only authorized lecturers/TAs can review correction requests.

#### Request Body

```json
{
  "status": "approved",
  "reason": "Attendance was confirmed by the lecturer."
}
```

#### Success Response

**HTTP Status: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "attendance_event_id": 101,
    "status": "approved",
    "reason": "Attendance was confirmed by the lecturer."
  }
}
```

#### Error Response — Correction Request Not Found

**HTTP Status: 404 Not Found**

```json
{
  "success": false,
  "error": {
    "code": "CORRECTION_REQUEST_NOT_FOUND",
    "message": "Correction request not found."
  }
}
```

#### Error Response — Forbidden

**HTTP Status: 403 Forbidden**

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not authorized to review correction requests."
  }
}
```

#### Error Response — Invalid Status

**HTTP Status: 400 Bad Request**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Status must be approved or rejected."
  }
}
```
## 12. Attendance Records & Export

### Get Attendance Records

GET /api/v1/attendance/records

#### Authentication

Required: Bearer Token

#### Query Parameters

```text
course_id
section_id
lecturer_id
student_id
from_date
to_date
```

#### Success Response

**HTTP Status: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "attendance_event_id": 101,
      "student_id": 15,
      "student_name": "Sara Mohamed",
      "course_id": 1,
      "course_code": "AI301",
      "course_name": "Machine Learning",
      "section_id": 2,
      "attendance_status": "present",
      "scanned_at": "2026-09-20T10:03:25Z"
    }
  ]
}
```

#### Error Response — Internal Server Error

**HTTP Status: 500 Internal Server Error**

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred."
  }
}
```
### Export Attendance Records

GET /api/v1/attendance/records/export

#### Authentication

Required: Bearer Token

#### Query Parameters

```text
format
course_id
section_id
lecturer_id
student_id
from_date
to_date
```

`format` is required and must be either `csv` or `pdf`.

#### Success Response

**HTTP Status: 200 OK**

The API returns the attendance records as a file in the requested format.

The exported data must match the applied filters.

#### Error Response — Invalid Format

**HTTP Status: 400 Bad Request**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EXPORT_FORMAT",
    "message": "Format must be csv or pdf."
  }
}
```

#### Error Response — Internal Server Error

**HTTP Status: 500 Internal Server Error**

```json
{
  "success": false,
  "error": {
    "code": "EXPORT_FAILED",
    "message": "Failed to generate the attendance export."
  }
}
```
## 13. Data Import

### Import CSV Data

POST /api/v1/imports/{resource}

#### Authentication

Required: Bearer Token

Only authorized attendance administrators can import data.

#### Request

The request contains a CSV file for the selected resource.

Supported resources:
- courses
- sections
- teaching staff
- students
- enrollment
- timetable
- rooms/labs

#### Success Response

**HTTP Status: 201 Created**

The API creates valid records from the CSV file and returns the number of imported records and rejected rows.

#### Example Response

```json
{
  "success": true,
  "data": {
    "imported_count": 28,
    "rejected_count": 2,
    "rejected_rows": [
      {
        "row": 5,
        "reason": "Missing course_id"
      },
      {
        "row": 12,
        "reason": "Invalid section_id"
      }
    ]
  }
}
```

#### Error Response — Forbidden

**HTTP Status: 403 Forbidden**

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not authorized to import data."
  }
}
```

#### Error Response — Invalid CSV

**HTTP Status: 400 Bad Request**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CSV",
    "message": "The uploaded CSV file is invalid."
  }
}
```