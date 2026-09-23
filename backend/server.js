const express = require("express");
const pool = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const multer = require("multer");
const { parse } = require("csv-parse/sync");

const authenticateToken = require("./middleware/authMiddleware");
const authorizeRole = require("./middleware/roleMiddleware");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

app.use(cors());
app.use(express.json());

/* =========================================================
   REQUEST ID
========================================================= */

const crypto = require("crypto");

app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  next();
});
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (
      body &&
      body.success === false &&
      body.error &&
      !body.error.request_id
    ) {
      body.error.request_id = req.requestId;
    }

    return originalJson(body);
  };

  next();
});
/* =========================================================
   AUTHENTICATION
========================================================= */

app.post("/api/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Email and password are required",
      },
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        email,
        password_hash,
        name,
        role,
        student_code,
        staff_code,
        status
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    const user = result.rows[0];

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ACCOUNT_INACTIVE",
          message: "User account is inactive",
        },
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "2h",
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        access_token: token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      },
    });
  }
});

/* =========================================================
   TEST PROTECTED ROUTE
========================================================= */

app.get(
  "/api/v1/protected",
  authenticateToken,
  authorizeRole("lecturer"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "You are authorized",
      user: req.user,
    });
  }
);

/* =========================================================
   USERS
========================================================= */

app.get(
  "/api/v1/users",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          email,
          name,
          role,
          student_code,
          staff_code,
          status,
          created_at,
          updated_at
        FROM users
        ORDER BY id
        `
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get users error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   COURSES
========================================================= */

app.get(
  "/api/v1/courses",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          course_code,
          name
        FROM courses
        ORDER BY id
        `
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get courses error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   SECTIONS
========================================================= */

app.get(
  "/api/v1/sections",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          s.id,
          s.course_id,
          c.course_code,
          c.name AS course_name,
          s.staff_id,
          u.name AS staff_name,
          s.section_code,
          s.semester,
          s.academic_year
        FROM sections s
        JOIN courses c
          ON c.id = s.course_id
        JOIN users u
          ON u.id = s.staff_id
        ORDER BY s.id
        `
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get sections error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   SECTION STUDENTS
========================================================= */

app.get(
  "/api/v1/sections/:sectionId/students",
  authenticateToken,
  async (req, res) => {
    const { sectionId } = req.params;

    try {
      const sectionResult = await pool.query(
        `
        SELECT id
        FROM sections
        WHERE id = $1
        `,
        [sectionId]
      );

      if (sectionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SECTION_NOT_FOUND",
            message: "Section not found",
          },
        });
      }

      const result = await pool.query(
        `
        SELECT
          u.id,
          u.name,
          u.email,
          u.student_code,
          e.status AS enrollment_status,
          e.enrolled_at
        FROM enrollment e
        JOIN users u
          ON u.id = e.student_id
        WHERE e.section_id = $1
        ORDER BY u.id
        `,
        [sectionId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get section students error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   GET MY SECTIONS
========================================================= */

app.get(
  "/api/v1/students/me/sections",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    const studentId = req.user.userId;

    try {
      const result = await pool.query(
        `
        SELECT
          s.id AS section_id,
          s.section_code,
          s.semester,
          s.academic_year,

          c.id AS course_id,
          c.course_code,
          c.name AS course_name,

          u.id AS staff_id,
          u.name AS staff_name

        FROM enrollment e

        JOIN sections s
          ON s.id = e.section_id

        JOIN courses c
          ON c.id = s.course_id

        JOIN users u
          ON u.id = s.staff_id

        WHERE e.student_id = $1
          AND e.status = 'active'

        ORDER BY s.id
        `,
        [studentId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error(
        "Get student sections error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   STUDENT ATTENDANCE
========================================================= */

app.get(
  "/api/v1/students/me/attendance",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    const studentId = req.user.userId;

    try {
      const result = await pool.query(
        `
        SELECT
          ae.id AS attendance_event_id,
          ae.session_id,
          ae.scanned_at,
          ae.validation_status,
          ae.attendance_status,
          ae.rejection_reason,
          s.id AS section_id,
          s.section_code,
          c.id AS course_id,
          c.course_code,
          c.name AS course_name
        FROM attendance_event ae
        JOIN attendance_session ats
          ON ats.id = ae.session_id
        JOIN timetable t
          ON t.id = ats.timetable_id
        JOIN sections s
          ON s.id = t.section_id
        JOIN courses c
          ON c.id = s.course_id
        WHERE ae.student_id = $1
        ORDER BY ae.scanned_at DESC NULLS LAST, ae.id DESC
        `,
        [studentId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get student attendance error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   STAFF
========================================================= */

app.get(
  "/api/v1/staff",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          role,
          staff_code,
          status
        FROM users
        WHERE role IN ('lecturer', 'ta')
        ORDER BY id
        `
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get staff error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   STAFF ME
========================================================= */

app.get(
  "/api/v1/staff/me",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const staffId = req.user.userId;

    try {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          role,
          staff_code,
          status
        FROM users
        WHERE id = $1
        `,
        [staffId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "STAFF_NOT_FOUND",
            message: "Staff member not found",
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Get staff profile error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   STAFF SECTIONS
========================================================= */

app.get(
  "/api/v1/staff/me/sections",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const staffId = req.user.userId;

    try {
      const result = await pool.query(
        `
        SELECT
          s.id,
          s.section_code,
          s.semester,
          s.academic_year,
          c.id AS course_id,
          c.course_code,
          c.name AS course_name
        FROM sections s
        JOIN courses c
          ON c.id = s.course_id
        WHERE s.staff_id = $1
        ORDER BY s.id
        `,
        [staffId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get staff sections error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   STAFF TIMETABLE
========================================================= */

app.get(
  "/api/v1/staff/me/timetable",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const staffId = req.user.userId;

    try {
      const result = await pool.query(
        `
        SELECT
          t.id,
          t.section_id,
          s.section_code,
          c.id AS course_id,
          c.course_code,
          c.name AS course_name,
          t.room_id,
          r.name AS room_name,
          r.building,
          t.day_of_week,
          t.start_time,
          t.end_time
        FROM timetable t
        JOIN sections s
          ON s.id = t.section_id
        JOIN courses c
          ON c.id = s.course_id
        JOIN rooms r
          ON r.id = t.room_id
        WHERE s.staff_id = $1
        ORDER BY t.id
        `,
        [staffId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get staff timetable error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   TIMETABLE
========================================================= */

app.get(
  "/api/v1/timetable",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          t.id,
          t.section_id,
          s.section_code,
          s.staff_id,
          u.name AS staff_name,
          c.id AS course_id,
          c.course_code,
          c.name AS course_name,
          t.room_id,
          r.name AS room_name,
          r.building,
          t.day_of_week,
          t.start_time,
          t.end_time
        FROM timetable t
        JOIN sections s
          ON s.id = t.section_id
        JOIN users u
          ON u.id = s.staff_id
        JOIN courses c
          ON c.id = s.course_id
        JOIN rooms r
          ON r.id = t.room_id
        ORDER BY t.id
        `
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get timetable error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   OPEN ATTENDANCE SESSION
========================================================= */

app.post(
  "/api/v1/attendance/sessions",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const { timetable_id } = req.body;
    const staffId = req.user.userId;

    if (!timetable_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "timetable_id is required",
        },
      });
    }

    try {
      const timetableResult = await pool.query(
        `
       SELECT
  t.id,
  t.section_id,
  t.day_of_week,
  t.start_time,
  t.end_time,
  s.staff_id
FROM timetable t
JOIN sections s
  ON s.id = t.section_id
WHERE t.id = $1
        `,
        [timetable_id]
      );

      if (timetableResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "TIMETABLE_NOT_FOUND",
            message: "Timetable entry not found",
          },
        });
      }
      const timetable = timetableResult.rows[0];

       if (Number(timetable.staff_id) !== Number(staffId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You are not assigned to this timetable",
          },
        });
      }


const now = new Date();

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const currentDay = dayNames[now.getDay()];

if (currentDay !== timetable.day_of_week) {
  return res.status(400).json({
    success: false,
    error: {
      code: "SESSION_OUTSIDE_SCHEDULE",
      message: "Cannot open attendance session outside the scheduled day",
    },
  });
}

const currentTime = now.toTimeString().slice(0, 8);

if (
  currentTime < timetable.start_time ||
  currentTime > timetable.end_time
) {
  return res.status(400).json({
    success: false,
    error: {
      code: "SESSION_OUTSIDE_SCHEDULE",
      message: "Cannot open attendance session outside the scheduled time",
    },
  });
}

     
      

      const openSessionResult = await pool.query(
        `
        SELECT id
        FROM attendance_session
        WHERE timetable_id = $1
          AND status = 'open'
        LIMIT 1
        `,
        [timetable_id]
      );

      if (openSessionResult.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_ALREADY_OPEN",
            message: "An attendance session is already open for this timetable",
          },
        });
      }

      const sessionResult = await pool.query(
        `
        INSERT INTO attendance_session (
          timetable_id,
          opened_by,
          started_at,
          status,
          qr_secret_version,
          week_number
        )
        VALUES (
          $1,
          $2,
          CURRENT_TIMESTAMP,
          'open',
          1,
          1
        )
        RETURNING
          id,
          timetable_id,
          opened_by,
          started_at,
          ended_at,
          status,
          qr_secret_version,
          week_number
        `,
        [timetable_id, staffId]
      );

      return res.status(201).json({
        success: true,
        data: sessionResult.rows[0],
      });
    } catch (error) {
      console.error("Open attendance session error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   CLOSE ATTENDANCE SESSION
========================================================= */

app.patch(
  "/api/v1/attendance/sessions/:sessionId/close",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const { sessionId } = req.params;
    const staffId = req.user.userId;

    try {
      const sessionResult = await pool.query(
        `
        SELECT
          id,
          opened_by,
          status,
          started_at,
          ended_at
        FROM attendance_session
        WHERE id = $1
        `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Attendance session not found",
          },
        });
      }

      const session = sessionResult.rows[0];

      if (Number(session.opened_by) !== Number(staffId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You did not open this attendance session",
          },
        });
      }

      if (session.status !== "open") {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_NOT_OPEN",
            message: "Attendance session is not open",
          },
        });
      }

      const result = await pool.query(
        `
        UPDATE attendance_session
        SET
          status = 'closed',
          ended_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          timetable_id,
          opened_by,
          started_at,
          ended_at,
          status,
          qr_secret_version,
          week_number
        `,
        [sessionId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Close attendance session error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);
/* =========================================================
   GET MY ATTENDANCE SESSIONS
========================================================= */
app.get(
  "/api/v1/attendance/sessions/:sessionId/qr",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const { sessionId } = req.params;
    const staffId = req.user.userId;

    try {
      const sessionResult = await pool.query(
        `
        SELECT
          ats.id,
          ats.status,
          ats.opened_by,
          ats.qr_secret_version
        FROM attendance_session ats
        WHERE ats.id = $1
        `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Attendance session not found",
          },
        });
      }

      const session = sessionResult.rows[0];

      if (Number(session.opened_by) !== Number(staffId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You did not open this attendance session",
          },
        });
      }

      if (session.status !== "open") {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_NOT_OPEN",
            message: "Attendance session is not open",
          },
        });
      }

      // Rotate QR version
      const versionResult = await pool.query(
        `
        UPDATE attendance_session
        SET qr_secret_version = qr_secret_version + 1
        WHERE id = $1
          AND status = 'open'
        RETURNING qr_secret_version
        `,
        [sessionId]
      );

      if (versionResult.rows.length === 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_NOT_OPEN",
            message: "Attendance session is not open",
          },
        });
      }

      const currentSecretVersion =
        versionResult.rows[0].qr_secret_version;

      // Each QR token is valid for 10 seconds
      const rotationMs = 10 * 1000;
      const generatedAtMs = Date.now();
      const expiresAtMs = generatedAtMs + rotationMs;

      const token = jwt.sign(
        {
          type: "attendance_qr",
          sessionId: Number(sessionId),
          secretVersion: currentSecretVersion,
          generatedAt: generatedAtMs,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "10s",
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          token,
          rotationSec: 10,
          expiresAt: new Date(expiresAtMs).toISOString(),
        },
      });
    } catch (error) {
      console.error("Generate QR error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   SCAN QR
========================================================= */
const scanAttempts = new Map();

async function logRejectedScan({
  studentId,
  sessionId,
  reason,
}) {
  try {
    await pool.query(
      `
      INSERT INTO audit_event
        (
          actor_id,
          action,
          entity_type,
          entity_id,
          before_value,
          after_value,
          reason
        )
      VALUES
        (
          $1,
          'ATTENDANCE_SCAN_REJECTED',
          'attendance_session',
          $2,
          NULL,
          NULL,
          $3
        )
      `,
      [studentId, sessionId, reason]
    );
  } catch (error) {
    console.error(
      "Failed to log rejected scan:",
      error.message
    );
  }
}
async function getWeeklyRiskFeatures(
  studentId,
  sectionId,
  weekNumber
) {
  const result = await pool.query(
    `
    SELECT
      ats.week_number,

      COUNT(DISTINCT ats.id)::int AS sessions_count,

      COUNT(
        DISTINCT CASE
          WHEN ae.attendance_status IN ('present', 'late')
          THEN ats.id
        END
      )::int AS attended_count,

      COUNT(
        DISTINCT CASE
          WHEN ae.attendance_status = 'absent'
          THEN ats.id
        END
      )::int AS absent_count

    FROM attendance_session ats

    JOIN timetable t
      ON t.id = ats.timetable_id

    LEFT JOIN attendance_event ae
      ON ae.session_id = ats.id
      AND ae.student_id = $1

    WHERE t.section_id = $2
      AND ats.week_number < $3

    GROUP BY ats.week_number
    ORDER BY ats.week_number ASC
    `,
    [studentId, sectionId, weekNumber]
  );

  const weeks = result.rows.map((row) => ({
    weekNumber: Number(row.week_number),
    sessions: Number(row.sessions_count),
    attended: Number(row.attended_count),
    absent: Number(row.absent_count),
    rate:
      Number(row.sessions_count) > 0
        ? Number(row.attended_count) /
          Number(row.sessions_count)
        : 0,
  }));

  // ==========================================
  // 1. attendance_rate_to_date
  // ==========================================

  const totalSessions = weeks.reduce(
    (sum, week) => sum + week.sessions,
    0
  );

  const totalAttended = weeks.reduce(
    (sum, week) => sum + week.attended,
    0
  );

  const attendanceRateToDate =
    totalSessions > 0
      ? totalAttended / totalSessions
      : 0;

  // ==========================================
  // 2. trend_last_3
  // ==========================================

  let trendLast3 = 0;

  if (weeks.length >= 3) {
    const recentThree = weeks.slice(-3);

    const recentAverage =
      recentThree.reduce(
        (sum, week) => sum + week.rate,
        0
      ) / 3;

    const previousWeeks = weeks.slice(
      0,
      Math.max(weeks.length - 3, 0)
    );

    if (previousWeeks.length > 0) {
      const previousThree = previousWeeks.slice(-3);

      const previousAverage =
        previousThree.reduce(
          (sum, week) => sum + week.rate,
          0
        ) / previousThree.length;

      trendLast3 =
        recentAverage - previousAverage;
    }
  }

  // ==========================================
  // 3. consecutive_absences
  // ==========================================

  let consecutiveAbsences = 0;

  for (let i = weeks.length - 1; i >= 0; i--) {
    if (
      weeks[i].sessions > 0 &&
      weeks[i].attended === 0
    ) {
      consecutiveAbsences++;
    } else {
      break;
    }
  }

  // ==========================================
  // 4. course_load
  // ==========================================

  const courseLoadResult = await pool.query(
    `
    SELECT COUNT(DISTINCT section_id)::int AS course_load
    FROM enrollment
    WHERE student_id = $1
      AND status = 'active'
    `,
    [studentId]
  );

  const courseLoad =
    courseLoadResult.rows[0]?.course_load || 0;

  // ==========================================
  // 5. rejected_last_2
  // ==========================================

  const rejectedResult = await pool.query(
    `
    SELECT COUNT(*)::int AS rejected_count

    FROM audit_event ae

    JOIN attendance_session ats
      ON ats.id = ae.entity_id

    JOIN timetable t
      ON t.id = ats.timetable_id

    WHERE ae.action = 'ATTENDANCE_SCAN_REJECTED'
      AND ae.actor_id = $1
      AND t.section_id = $2
      AND ats.week_number >= $3 - 2
      AND ats.week_number < $3
      AND ae.reason IN (
        'EXPIRED_QR',
        'DUPLICATE_SCAN'
      )
    `,
    [studentId, sectionId, weekNumber]
  );

  const rejectedLast2 =
    rejectedResult.rows[0]?.rejected_count || 0;

  return {
    attendance_rate_to_date: Number(
      attendanceRateToDate.toFixed(4)
    ),

    trend_last_3: Number(
      trendLast3.toFixed(4)
    ),

    rejected_last_2: Number(
      rejectedLast2
    ),

    consecutive_absences: Number(
      consecutiveAbsences
    ),

    course_load: Number(
      courseLoad
    ),
  };
}

// AI Service
async function predictWeeklyRisk(features) {
  const response = await fetch(
    "https://weekly-attendance-risk-production.up.railway.app/predict-weekly-risk",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-key": process.env.AI_SERVICE_KEY,
      },
      body: JSON.stringify(features),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.message ||
      "AI service request failed"
    );
  }

  return data;
}

function scanRateLimit(req, res, next) {
  const studentId = String(req.user.userId);
  const now = Date.now();

  const windowMs = 60 * 1000;
  const maxAttempts = 10;

  const previousAttempts = scanAttempts.get(studentId) || [];

  const recentAttempts = previousAttempts.filter(
    (timestamp) => now - timestamp < windowMs
  );

  if (recentAttempts.length >= maxAttempts) {
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many scan attempts. Please try again later.",
      },
    });
  }

  recentAttempts.push(now);
  scanAttempts.set(studentId, recentAttempts);

  next();
}

app.get(
  "/api/v1/students/me/risk-features",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    try {
      const studentId = req.user.userId;

      const enrollmentResult = await pool.query(
        `
        SELECT
          e.section_id
        FROM enrollment e
        WHERE e.student_id = $1
          AND e.status = 'active'
        ORDER BY e.section_id
        LIMIT 1
        `,
        [studentId]
      );

      if (enrollmentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NO_ENROLLMENT",
            message: "Student is not enrolled in any active section",
          },
        });
      }

      const sectionId = enrollmentResult.rows[0].section_id;

      const weekResult = await pool.query(
        `
        SELECT COALESCE(MAX(week_number), 1)::int AS week_number
        FROM attendance_session ats
        JOIN timetable t
          ON t.id = ats.timetable_id
        WHERE t.section_id = $1
        `,
        [sectionId]
      );

      const weekNumber = weekResult.rows[0].week_number;

      const features = await getWeeklyRiskFeatures(
        studentId,
        sectionId,
        weekNumber
      );

      return res.status(200).json({
        success: true,
        data: {
          student_id: studentId,
          section_id: sectionId,
          week_number: weekNumber,
          features,
        },
      });
    } catch (error) {
      console.error(
        "Get risk features error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

app.get(
  "/api/v1/students/me/risk",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    try {
      const studentId = req.user.userId;

      const enrollmentResult = await pool.query(
        `
        SELECT e.section_id
        FROM enrollment e
        WHERE e.student_id = $1
          AND e.status = 'active'
        ORDER BY e.section_id
        LIMIT 1
        `,
        [studentId]
      );
    
     if (enrollmentResult.rows.length === 0) {
  return res.status(404).json({
    success: false,
    error: {
      code: "NO_ENROLLMENT",
      message: "Student has no active enrollment."
    }
  });
}

      const sectionId = enrollmentResult.rows[0].section_id;

      const weekResult = await pool.query(
        `
        SELECT COALESCE(MAX(week_number), 1)::int AS week_number
        FROM attendance_session ats
        JOIN timetable t
          ON t.id = ats.timetable_id
        WHERE t.section_id = $1
        `,
        [sectionId]
      );

      const weekNumber = weekResult.rows[0].week_number;

      const features = await getWeeklyRiskFeatures(
        studentId,
        sectionId,
        weekNumber
      );

      const prediction = await predictWeeklyRisk(features);

      return res.status(200).json({
  success: true,
  data: {
    student_id: studentId,
    section_id: sectionId,
    week_number: weekNumber,
    features,
    risk: prediction,
  },
});
    } catch (error) {
  console.error("Weekly risk error:", error);
  console.error("AI service error message:", error.message);
  console.error("AI service error stack:", error.stack);

  return res.status(502).json({
    success: false,
    error: {
      code: "AI_SERVICE_ERROR",
      message: "Unable to calculate weekly attendance risk."
      }
      });
    }
  }
);


app.post(
  "/api/v1/attendance/scan",
  authenticateToken,
  authorizeRole("student"),
  scanRateLimit,
  async (req, res) => {

    const { token } = req.body;
    const studentId = req.user.userId;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "QR token is required",
        },
      });
    }

    try {
      // 1. Verify QR token signature
      let decoded;

      try {
  decoded = jwt.verify(token, process.env.JWT_SECRET);
} catch (error) {
  console.log("QR JWT ERROR:", error.name, error.message);

  let rejectedSessionId = null;

  try {
    const decodedWithoutVerification = jwt.decode(token);

    if (decodedWithoutVerification?.sessionId) {
      rejectedSessionId = Number(decodedWithoutVerification.sessionId);
    }
  } catch (decodeError) {
    console.log("QR decode error:", decodeError.message);
  }

  if (
    rejectedSessionId &&
    error.name === "TokenExpiredError"
  ) {
    await logRejectedScan({
      studentId,
      sessionId: rejectedSessionId,
      reason: "EXPIRED_QR",
    });
  }

  return res.status(401).json({
    success: false,
    error: {
      code: "INVALID_QR",
      message: "Invalid or expired QR token",
    },
  });
}

      // 2. Make sure this is an attendance QR
      if (decoded.type !== "attendance_qr") {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_QR",
            message: "Invalid QR token",
          },
        });
      }

      const sessionId = Number(decoded.sessionId);
      const secretVersion = Number(decoded.secretVersion);

      // 3. Get session
      const sessionResult = await pool.query(
        `
        SELECT
          id,
          status,
          qr_secret_version,
          timetable_id
        FROM attendance_session
        WHERE id = $1
        `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Attendance session not found",
          },
        });
      }

      const session = sessionResult.rows[0];

      // 4. Session must still be open
      if (session.status !== "open") {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_NOT_OPEN",
            message: "Attendance session is not open",
          },
        });
      }

      // 5. QR secret version must match
      if (Number(session.qr_secret_version) !== secretVersion) {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_QR",
            message: "QR token is no longer valid",
          },
        });
      }

      // 6. QR validity is handled by jwt.verify().
      // The QR token is valid for 10 seconds from the moment it was generated.

      // 7. Make sure student is enrolled in this session's section
      const enrollmentResult = await pool.query(
        `
        SELECT e.id
        FROM enrollment e
        JOIN timetable t
          ON t.section_id = e.section_id
        WHERE t.id = $1
          AND e.student_id = $2
          AND e.status = 'active'
        `,
        [session.timetable_id, studentId]
      );

      if (enrollmentResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: {
            code: "NOT_ENROLLED",
            message: "Student is not enrolled in this section",
          },
        });
      }

      // 8. Prevent duplicate attendance
      const attendanceResult = await pool.query(
        `
        SELECT id
        FROM attendance_event
        WHERE session_id = $1
          AND student_id = $2
          AND attendance_status IS NOT NULL
        `,
        [sessionId, studentId]
      );

      if (attendanceResult.rows.length > 0) {
  await logRejectedScan({
    studentId,
    sessionId,
    reason: "DUPLICATE_SCAN",
  });

  return res.status(409).json({
    success: false,
    error: {
      code: "DUPLICATE_ATTENDANCE",
      message: "Attendance has already been recorded",
    },
  });
}

      // 9. Generate short-lived scan ticket
      const scanTicket = jwt.sign(
        {
          type: "attendance_scan_ticket",
          sessionId,
          studentId: Number(studentId),
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "30s",
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          scanTicket,
          sessionId,
          expiresInSec: 30,
        },
      });
    } catch (error) {
      console.error("QR scan error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   CHECK-IN
========================================================= */

app.post(
  "/api/v1/attendance/check-in",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    const { scanTicket } = req.body;
    const studentId = req.user.userId;

    if (!scanTicket) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "scanTicket is required",
        },
      });
    }

    try {
      let decoded;

      try {
        decoded = jwt.verify(
          scanTicket,
          process.env.JWT_SECRET
        );
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_SCAN_TICKET",
            message: "Invalid or expired scan ticket",
          },
        });
      }

      if (decoded.type !== "attendance_scan_ticket") {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_SCAN_TICKET",
            message: "Invalid scan ticket",
          },
        });
      }

      const sessionId = Number(decoded.sessionId);
      const ticketStudentId = Number(decoded.studentId);

      if (ticketStudentId !== Number(studentId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Scan ticket does not belong to this student",
          },
        });
      }

      const sessionResult = await pool.query(
        `
        SELECT id, status
        FROM attendance_session
        WHERE id = $1
        `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Attendance session not found",
          },
        });
      }

      const session = sessionResult.rows[0];

      if (session.status !== "open") {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_NOT_OPEN",
            message: "Attendance session is not open",
          },
        });
      }

      const existingAttendance = await pool.query(
        `
        SELECT id
        FROM attendance_event
        WHERE session_id = $1
          AND student_id = $2
        `,
        [sessionId, studentId]
      );

      if (existingAttendance.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: "DUPLICATE_ATTENDANCE",
            message: "Attendance has already been recorded",
          },
        });
      }

      const attendanceResult = await pool.query(
  `
    INSERT INTO attendance_event (
      session_id,
      student_id,
      scanned_at,
      validation_status,
      attendance_status,
      rejection_reason
    )
    VALUES (
      $1,
      $2,
      CURRENT_TIMESTAMP,
      'accepted',
      'present',
      NULL
    )
    ON CONFLICT (session_id, student_id)
    DO NOTHING
    RETURNING
      id,
      session_id,
      student_id,
      scanned_at,
      validation_status,
      attendance_status
  `,
  [sessionId, studentId]
);

if (attendanceResult.rows.length === 0) {
  return res.status(409).json({
    success: false,
    error: {
      code: "DUPLICATE_ATTENDANCE",
      message: "Student has already checked in for this session",
    },
  });
}

return res.status(201).json({
  success: true,
  data: {
    attendance: attendanceResult.rows[0],
  },
});
    } catch (error) {
      console.error("Check-in error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   ATTENDANCE SESSION ROSTER
========================================================= */

app.get(
  "/api/v1/attendance/sessions/:sessionId/roster",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const { sessionId } = req.params;
    const staffId = req.user.userId;

    try {
      // 1. Get session + section + course information
      const sessionResult = await pool.query(
        `
        SELECT
          ats.id AS session_id,
          ats.status AS session_status,
          ats.opened_by,
          t.id AS timetable_id,
          s.id AS section_id,
          s.section_code,
          c.id AS course_id,
          c.course_code,
          c.name AS course_name
        FROM attendance_session ats
        JOIN timetable t
          ON t.id = ats.timetable_id
        JOIN sections s
          ON s.id = t.section_id
        JOIN courses c
          ON c.id = s.course_id
        WHERE ats.id = $1
        `,
        [sessionId]
      );

      // 2. Session must exist
      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Attendance session not found",
          },
        });
      }

      const session = sessionResult.rows[0];

      // 3. Only the staff member responsible for the session
      // can view its roster
      if (Number(session.opened_by) !== Number(staffId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You did not open this attendance session",
          },
        });
      }

      // 4. Get ALL enrolled students.
      // If there is an attendance event, return its status.
      // If there is no event, consider the student absent.
      const rosterResult = await pool.query(
        `
        SELECT
          u.id AS student_id,
          u.name AS student_name,
          u.email AS student_email,
          u.student_code,

          COALESCE(ae.attendance_status, 'absent')
            AS attendance_status,

          ae.id AS attendance_event_id,
          ae.scanned_at,
          ae.validation_status,
          ae.rejection_reason

        FROM enrollment e

        JOIN users u
          ON u.id = e.student_id

        LEFT JOIN attendance_event ae
          ON ae.session_id = $1
          AND ae.student_id = e.student_id
          AND ae.attendance_status IS NOT NULL

        WHERE e.section_id = $2
          AND e.status = 'active'

        ORDER BY u.id
        `,
        [sessionId, session.section_id]
      );

      return res.status(200).json({
        success: true,
        data: {
          session: {
            id: session.session_id,
            status: session.session_status,
            timetable_id: session.timetable_id,
            section_id: session.section_id,
            section_code: session.section_code,
            course_id: session.course_id,
            course_code: session.course_code,
            course_name: session.course_name,
          },
          roster: rosterResult.rows,
        },
      });
    } catch (error) {
      console.error("Get attendance roster error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   MANUAL ATTENDANCE CORRECTION
========================================================= */

app.patch(
  "/api/v1/attendance/sessions/:sessionId/students/:studentId",
  authenticateToken,
  authorizeRole("lecturer", "ta"),
  async (req, res) => {
    const { sessionId, studentId } = req.params;
    const { attendance_status, reason } = req.body;

    const staffId = req.user.userId;

    const allowedStatuses = ["present", "absent", "excused"];

    // 1. Validate attendance status
    if (!allowedStatuses.includes(attendance_status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "attendance_status must be present, absent, or excused",
        },
      });
    }

    // 2. Reason is mandatory
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Reason is required",
        },
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 3. Get session + section + assigned staff
      const sessionResult = await client.query(
        `
        SELECT
          ats.id AS session_id,
          ats.status AS session_status,
          s.id AS section_id,
          s.staff_id
        FROM attendance_session ats
        JOIN timetable t
          ON t.id = ats.timetable_id
        JOIN sections s
          ON s.id = t.section_id
        WHERE ats.id = $1
        `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Attendance session not found",
          },
        });
      }

      const session = sessionResult.rows[0];

      // 4. Session must be open
      if (session.session_status !== "open") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_NOT_OPEN",
            message: "Attendance session is not open",
          },
        });
      }

      // 5. Only assigned staff can modify attendance
      if (Number(session.staff_id) !== Number(staffId)) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You are not assigned to this section",
          },
        });
      }

      // 6. Check student enrollment
      const enrollmentResult = await client.query(
        `
        SELECT id
        FROM enrollment
        WHERE student_id = $1
          AND section_id = $2
          AND status = 'active'
        `,
        [studentId, session.section_id]
      );

      if (enrollmentResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_ENROLLED",
            message: "Student is not enrolled in this section",
          },
        });
      }

      // 7. Check if attendance event already exists
      const eventResult = await client.query(
        `
        SELECT
          id,
          attendance_status,
          validation_status,
          rejection_reason,
          scanned_at
        FROM attendance_event
        WHERE session_id = $1
          AND student_id = $2
        `,
        [sessionId, studentId]
      );

      let event;
      let beforeStatus = null;

      if (eventResult.rows.length > 0) {
        // Existing attendance event
        const oldEvent = eventResult.rows[0];

        beforeStatus = oldEvent.attendance_status;

        const updateResult = await client.query(
          `
          UPDATE attendance_event
          SET attendance_status = $1
          WHERE id = $2
          RETURNING
            id,
            session_id,
            student_id,
            scanned_at,
            validation_status,
            attendance_status,
            rejection_reason
          `,
          [attendance_status, oldEvent.id]
        );

        event = updateResult.rows[0];
      } else {
        // No attendance event yet -> create manual attendance
        const insertResult = await client.query(
          `
          INSERT INTO attendance_event
            (
              session_id,
              student_id,
              scanned_at,
              validation_status,
              attendance_status,
              rejection_reason
            )
          VALUES
            ($1, $2, NULL, NULL, $3, NULL)
          RETURNING
            id,
            session_id,
            student_id,
            scanned_at,
            validation_status,
            attendance_status,
            rejection_reason
          `,
          [sessionId, studentId, attendance_status]
        );

        event = insertResult.rows[0];
      }

      // 8. Create audit event
      await client.query(
        `
        INSERT INTO audit_event
          (
            actor_id,
            action,
            entity_type,
            entity_id,
            before_value,
            after_value,
            reason
          )
        VALUES
          (
            $1,
            'MANUAL_ATTENDANCE_UPDATE',
            'attendance_event',
            $2,
            $3,
            $4,
            $5
          )
        `,
        [
          staffId,
          event.id,
          beforeStatus,
          attendance_status,
          reason.trim(),
        ]
      );

      // 9. Finish transaction
      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        data: {
          attendance_event: event,
          before_status: beforeStatus,
          after_status: attendance_status,
          reason: reason.trim(),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Manual attendance correction error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   CREATE CORRECTION REQUEST
========================================================= */
app.post(
  "/api/v1/attendance/correction-requests",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    const { attendance_event_id, evidence } = req.body;

    const studentId = req.user.userId;

    if (!attendance_event_id || !evidence || !evidence.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "attendance_event_id and evidence are required",
        },
      });
    }

    try {
      // Check that the event belongs to this student
      const eventResult = await pool.query(
        `
        SELECT
          id,
          student_id,
          attendance_status
        FROM attendance_event
        WHERE id = $1
        `,
        [attendance_event_id]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "ATTENDANCE_EVENT_NOT_FOUND",
            message: "Attendance event not found",
          },
        });
      }

      const event = eventResult.rows[0];

      if (Number(event.student_id) !== Number(studentId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message:
              "You can only request correction for your own attendance",
          },
        });
      }

      // Prevent multiple pending requests for same event
      const existingRequest = await pool.query(
        `
        SELECT id
        FROM correction_request
        WHERE attendance_event_id = $1
          AND status = 'pending'
        `,
        [attendance_event_id]
      );

      if (existingRequest.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: "CORRECTION_REQUEST_EXISTS",
            message: "A pending correction request already exists",
          },
        });
      }

      const result = await pool.query(
        `
        INSERT INTO correction_request
          (
            attendance_event_id,
            evidence,
            status
          )
        VALUES
          ($1, $2, 'pending')
        RETURNING
          id,
          attendance_event_id,
          evidence,
          status,
          reviewer_id,
          reason,
          created_at,
          updated_at
        `,
        [attendance_event_id, evidence.trim()]
      );

      return res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Create correction request error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   GET MY CORRECTION REQUESTS
========================================================= */
app.get(
  "/api/v1/attendance/correction-requests/me",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    const studentId = req.user.userId;

    try {
      const result = await pool.query(
        `
        SELECT
          cr.id,
          cr.attendance_event_id,
          cr.evidence,
          cr.status,
          cr.reviewer_id,
          cr.reason,
          cr.created_at,
          cr.updated_at,

          ae.attendance_status,
          ae.scanned_at,

          ats.id AS session_id,
          ats.started_at AS session_started_at,

          s.id AS section_id,
          s.section_code,

          c.id AS course_id,
          c.course_code,
          c.name AS course_name

        FROM correction_request cr

        JOIN attendance_event ae
          ON ae.id = cr.attendance_event_id

        JOIN attendance_session ats
          ON ats.id = ae.session_id

        JOIN timetable t
          ON t.id = ats.timetable_id

        JOIN sections s
          ON s.id = t.section_id

        JOIN courses c
          ON c.id = s.course_id

        WHERE ae.student_id = $1

        ORDER BY cr.created_at DESC
        `,
        [studentId]
      );

      return res.status(200).json({
        success: true,
        data: {
          correction_requests: result.rows,
        },
      });
    } catch (error) {
      console.error(
        "Get my correction requests error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   GET CORRECTION REQUESTS FOR REVIEW
========================================================= */

app.get(
  "/api/v1/attendance/correction-requests",
  authenticateToken,
  authorizeRole("lecturer", "ta", "admin"),
  async (req, res) => {
    const reviewerId = req.user.userId;
    const { status } = req.query;

    try {
      const values = [];
      const conditions = [];

      // Lecturer / TA can only see requests
      // related to their own sections.
      if (req.user.role === "lecturer" || req.user.role === "ta") {
        values.push(reviewerId);
        conditions.push(`s.staff_id = $${values.length}`);
      }

      if (status) {
        const allowedStatuses = [
          "pending",
          "approved",
          "rejected",
        ];

        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "status must be pending, approved, or rejected",
            },
          });
        }

        values.push(status);
        conditions.push(`cr.status = $${values.length}`);
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const result = await pool.query(
        `
        SELECT
          cr.id,
          cr.attendance_event_id,
          cr.evidence,
          cr.status,
          cr.reviewer_id,
          cr.reason,
          cr.created_at,
          cr.updated_at,

          ae.student_id,
          ae.attendance_status,
          ae.scanned_at,

          student.name AS student_name,
          student.email AS student_email,
          student.student_code,

          ats.id AS session_id,
          ats.started_at AS session_started_at,

          s.id AS section_id,
          s.section_code,

          c.id AS course_id,
          c.course_code,
          c.name AS course_name,

          s.staff_id AS lecturer_id,
          staff.name AS lecturer_name

        FROM correction_request cr

        JOIN attendance_event ae
          ON ae.id = cr.attendance_event_id

        JOIN attendance_session ats
          ON ats.id = ae.session_id

        JOIN timetable t
          ON t.id = ats.timetable_id

        JOIN sections s
          ON s.id = t.section_id

        JOIN courses c
          ON c.id = s.course_id

        JOIN users student
          ON student.id = ae.student_id

        JOIN users staff
          ON staff.id = s.staff_id

        ${whereClause}

        ORDER BY
          CASE
            WHEN cr.status = 'pending' THEN 0
            ELSE 1
          END,
          cr.created_at DESC
        `,
        values
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error(
        "Get correction requests error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

app.patch(
  "/api/v1/attendance/correction-requests/:requestId",
  authenticateToken,
  authorizeRole("lecturer", "ta", "admin"),
  async (req, res) => {
    const { requestId } = req.params;
    const { status, reason } = req.body;

    const reviewerId = req.user.userId;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "status must be approved or rejected",
        },
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Reason is required",
        },
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const requestResult = await client.query(
        `
        SELECT
          cr.id,
          cr.status,
          cr.attendance_event_id,
          ae.student_id,
          ae.attendance_status,
          ats.id AS session_id,
          s.staff_id
        FROM correction_request cr
        JOIN attendance_event ae
          ON ae.id = cr.attendance_event_id
        JOIN attendance_session ats
          ON ats.id = ae.session_id
        JOIN timetable t
          ON t.id = ats.timetable_id
        JOIN sections s
          ON s.id = t.section_id
        WHERE cr.id = $1
        `,
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          error: {
            code: "CORRECTION_REQUEST_NOT_FOUND",
            message: "Correction request not found",
          },
        });
      }

      const request = requestResult.rows[0];

      if (request.status !== "pending") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          error: {
            code: "REQUEST_ALREADY_REVIEWED",
            message: "This correction request was already reviewed",
          },
        });
      }

      // Admin can review everything.
      // Lecturer/TA can review requests for their own sections.
      if (
        req.user.role !== "admin" &&
        Number(request.staff_id) !== Number(reviewerId)
      ) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You are not assigned to this section",
          },
        });
      }

      // Approved correction changes attendance.
      if (status === "approved") {
        await client.query(
          `
          UPDATE attendance_event
          SET attendance_status = 'present'
          WHERE id = $1
          `,
          [request.attendance_event_id]
        );
      }

      // Update correction request
      const updatedRequestResult = await client.query(
        `
        UPDATE correction_request
        SET
          status = $1,
          reviewer_id = $2,
          reason = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING
          id,
          attendance_event_id,
          evidence,
          status,
          reviewer_id,
          reason,
          created_at,
          updated_at
        `,
        [status, reviewerId, reason.trim(), requestId]
      );

      // Audit the attendance change when approved
      if (status === "approved") {
        await client.query(
          `
          INSERT INTO audit_event
            (
              actor_id,
              action,
              entity_type,
              entity_id,
              before_value,
              after_value,
              reason
            )
          VALUES
            (
              $1,
              'CORRECTION_REQUEST_APPROVED',
              'attendance_event',
              $2,
              $3,
              'present',
              $4
            )
          `,
          [
            reviewerId,
            request.attendance_event_id,
            request.attendance_status,
            reason.trim(),
          ]
        );
      }

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        data: updatedRequestResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Review correction request error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   ATTENDANCE RECORDS
========================================================= */

app.get(
  "/api/v1/attendance/records",
  authenticateToken,
  authorizeRole("student", "lecturer", "ta", "admin"),
  async (req, res) => {
    const {
      course_id,
      section_id,
      lecturer_id,
      student_id,
      from_date,
      to_date,
    } = req.query;

    try {
      const values = [];
      const conditions = [];

      // Student can only see their own records
      if (req.user.role === "student") {
        values.push(req.user.userId);
        conditions.push(`ae.student_id = $${values.length}`);
      }

      // Lecturer / TA can only see their own sections
      if (req.user.role === "lecturer" || req.user.role === "ta") {
        values.push(req.user.userId);
        conditions.push(`s.staff_id = $${values.length}`);
      }

      if (course_id) {
        values.push(course_id);
        conditions.push(`c.id = $${values.length}`);
      }

      if (section_id) {
        values.push(section_id);
        conditions.push(`s.id = $${values.length}`);
      }

      if (student_id) {
        values.push(student_id);
        conditions.push(`ae.student_id = $${values.length}`);
      }

      if (lecturer_id) {
        values.push(lecturer_id);
        conditions.push(`s.staff_id = $${values.length}`);
      }

      if (from_date) {
        values.push(from_date);
        conditions.push(
          `COALESCE(ae.scanned_at, ats.started_at)::date >= $${values.length}`
        );
      }

      if (to_date) {
        values.push(to_date);
        conditions.push(
          `COALESCE(ae.scanned_at, ats.started_at)::date <= $${values.length}`
        );
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const result = await pool.query(
        `
        SELECT
          ae.id AS attendance_event_id,
          ae.session_id,
          ae.student_id,
          u.name AS student_name,
          u.email AS student_email,
          u.student_code,

          c.id AS course_id,
          c.course_code,
          c.name AS course_name,

          s.id AS section_id,
          s.section_code,

          s.staff_id AS lecturer_id,
          staff.name AS lecturer_name,

          ats.started_at AS session_started_at,
          ats.ended_at AS session_ended_at,

          ae.scanned_at,
          ae.validation_status,
          ae.attendance_status,
          ae.rejection_reason

        FROM attendance_event ae

        JOIN users u
          ON u.id = ae.student_id

        JOIN attendance_session ats
          ON ats.id = ae.session_id

        JOIN timetable t
          ON t.id = ats.timetable_id

        JOIN sections s
          ON s.id = t.section_id

        JOIN courses c
          ON c.id = s.course_id

        JOIN users staff
          ON staff.id = s.staff_id

        ${whereClause}

        ORDER BY ats.started_at DESC, ae.id DESC
        `,
        values
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
        filters: {
          course_id: course_id || null,
          section_id: section_id || null,
          lecturer_id: lecturer_id || null,
          student_id: student_id || null,
          from_date: from_date || null,
          to_date: to_date || null,
        },
      });
    } catch (error) {
      console.error(
        "Get attendance records error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   ATTENDANCE CSV EXPORT
========================================================= */

app.get(
  "/api/v1/attendance/records/export",
  authenticateToken,
authorizeRole("student", "lecturer", "ta", "admin" , "auditor"),
async (req, res) => {
    const {
      format = "csv",
      course_id,
      section_id,
      lecturer_id,
      student_id,
      from_date,
      to_date,
    } = req.query;

    if (!["csv", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "UNSUPPORTED_FORMAT",
          message: "format must be csv or pdf",
        },
      });
    }

    try {
      const values = [];
      const conditions = [];

      // Student can only see their own attendance
      if (req.user.role === "student") {
        values.push(req.user.userId);
        conditions.push(`ae.student_id = $${values.length}`);
      }

      // Lecturer / TA can only see attendance
      // for their own sections
      if (req.user.role === "lecturer" || req.user.role === "ta") {
        values.push(req.user.userId);
        conditions.push(`s.staff_id = $${values.length}`);
      }

      if (course_id) {
        values.push(course_id);
        conditions.push(`c.id = $${values.length}`);
      }

      if (section_id) {
        values.push(section_id);
        conditions.push(`s.id = $${values.length}`);
      }

      if (lecturer_id) {
        values.push(lecturer_id);
        conditions.push(`s.staff_id = $${values.length}`);
      }

      if (student_id) {
        values.push(student_id);
        conditions.push(`ae.student_id = $${values.length}`);
      }

      if (from_date) {
        values.push(from_date);
        conditions.push(
          `COALESCE(ae.scanned_at, ats.started_at)::date >= $${values.length}`
        );
      }

      if (to_date) {
        values.push(to_date);
        conditions.push(
          `COALESCE(ae.scanned_at, ats.started_at)::date <= $${values.length}`
        );
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const result = await pool.query(
        `
        SELECT
          ae.id AS attendance_event_id,
          ae.session_id,
          ae.student_id,
          u.name AS student_name,
          u.email AS student_email,
          u.student_code,
          c.course_code,
          c.name AS course_name,
          s.section_code,
          staff.name AS lecturer_name,
          ats.started_at AS session_started_at,
          ae.scanned_at,
          ae.validation_status,
          ae.attendance_status,
          ae.rejection_reason

        FROM attendance_event ae

        JOIN users u
          ON u.id = ae.student_id

        JOIN attendance_session ats
          ON ats.id = ae.session_id

        JOIN timetable t
          ON t.id = ats.timetable_id

        JOIN sections s
          ON s.id = t.section_id

        JOIN courses c
          ON c.id = s.course_id

        JOIN users staff
          ON staff.id = s.staff_id

        ${whereClause}

        ORDER BY ats.started_at DESC, ae.id DESC
        `,
        values
      );

      // =====================================================
      // CSV EXPORT
      // =====================================================

      if (format === "csv") {
        const escapeCsv = (value) => {
          if (value === null || value === undefined) {
            return "";
          }

          const stringValue = String(value);

          if (
            stringValue.includes(",") ||
            stringValue.includes('"') ||
            stringValue.includes("\n")
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }

          return stringValue;
        };

        const headers = [
          "attendance_event_id",
          "session_id",
          "student_id",
          "student_name",
          "student_email",
          "student_code",
          "course_code",
          "course_name",
          "section_code",
          "lecturer_name",
          "session_started_at",
          "scanned_at",
          "validation_status",
          "attendance_status",
          "rejection_reason",
        ];

        const csvRows = [
          headers.join(","),
          ...result.rows.map((row) =>
            headers
              .map((header) => escapeCsv(row[header]))
              .join(",")
          ),
        ];

        const csv = csvRows.join("\n");

        res.setHeader(
          "Content-Type",
          "text/csv; charset=utf-8"
        );

        res.setHeader(
          "Content-Disposition",
          'attachment; filename="attendance-records.csv"'
        );

        return res.status(200).send(csv);
      }

      // =====================================================
      // PDF EXPORT
      // =====================================================

      if (format === "pdf") {
        res.setHeader(
          "Content-Type",
          "application/pdf"
        );

        res.setHeader(
          "Content-Disposition",
          'attachment; filename="attendance-records.pdf"'
        );

        const doc = new PDFDocument({
          margin: 40,
          size: "A4",
        });

        doc.pipe(res);

        doc
          .fontSize(18)
          .text("Smart Attendance - Attendance Records", {
            align: "center",
          });

        doc.moveDown();

        doc
          .fontSize(9)
          .text(
            `Generated: ${new Date().toISOString()}`
          );

        doc.moveDown();

        if (result.rows.length === 0) {
          doc
            .fontSize(12)
            .text("No attendance records found.");
        } else {
          result.rows.forEach((row, index) => {
            doc
              .fontSize(9)
              .text(
                `${index + 1}. ${row.student_name || "N/A"} | ` +
                `Code: ${row.student_code || "N/A"} | ` +
                `Course: ${row.course_code || "N/A"} | ` +
                `Section: ${row.section_code || "N/A"} | ` +
                `Status: ${row.attendance_status || "N/A"}`
              );

            doc
              .fontSize(8)
              .text(
                `Session: ${row.session_started_at || "N/A"} | ` +
                `Lecturer: ${row.lecturer_name || "N/A"}`
              );

            doc.moveDown(0.5);
          });
        }

        doc.end();

        return;
      }
    } catch (error) {
      console.error(
        "Attendance export error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);
/* =========================================================
   STUDENT PROFILE
========================================================= */

app.get(
  "/api/v1/students/me",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          student_code,
          status,
          created_at,
          updated_at
        FROM users
        WHERE id = $1
          AND role = 'student'
        `,
        [req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "STUDENT_NOT_FOUND",
            message: "Student profile not found",
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Get student profile error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);
app.patch(
  "/api/v1/students/me",
  authenticateToken,
  authorizeRole("student"),
  async (req, res) => {
    const { name, current_password, new_password } = req.body;

    if (!name && !new_password) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Nothing to update",
        },
      });
    }

    try {
      const userResult = await pool.query(
        `
        SELECT
          id,
          name,
          password_hash
        FROM users
        WHERE id = $1
          AND role = 'student'
        `,
        [req.user.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "STUDENT_NOT_FOUND",
            message: "Student profile not found",
          },
        });
      }

      const user = userResult.rows[0];

      let passwordHash = user.password_hash;

      if (new_password) {
        if (!current_password) {
          return res.status(400).json({
            success: false,
            error: {
              code: "CURRENT_PASSWORD_REQUIRED",
              message: "Current password is required",
            },
          });
        }

        const passwordMatches = await bcrypt.compare(
          current_password,
          user.password_hash
        );

        if (!passwordMatches) {
          return res.status(401).json({
            success: false,
            error: {
              code: "INVALID_CURRENT_PASSWORD",
              message: "Current password is incorrect",
            },
          });
        }

        if (new_password.length < 8) {
          return res.status(400).json({
            success: false,
            error: {
              code: "WEAK_PASSWORD",
              message: "New password must be at least 8 characters",
            },
          });
        }

        passwordHash = await bcrypt.hash(new_password, 10);
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          name = COALESCE($1, name),
          password_hash = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING
          id,
          name,
          email,
          student_code,
          status,
          created_at,
          updated_at
        `,
        [name || null, passwordHash, req.user.userId]
      );

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Update student profile error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

app.post(
  "/api/v1/imports/rooms",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: "FILE_REQUIRED",
          message: "CSV file is required",
        },
      });


    }

    try {
      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const imported = [];
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        if (!row.name || !row.building || !row.capacity || !row.type) {
          rejected.push({
            row: rowNumber,
            reason: "Missing required field",
            data: row,
          });
          continue;
        }

        const capacity = Number(row.capacity);

        if (!Number.isInteger(capacity) || capacity <= 0) {
          rejected.push({
            row: rowNumber,
            reason: "Capacity must be a positive integer",
            data: row,
          });
          continue;
        }

        try {
          const result = await pool.query(
            `
              INSERT INTO rooms (
                name,
                building,
                capacity,
                type
              )
              VALUES ($1, $2, $3, $4)
              RETURNING id, name, building, capacity, type
            `,
            [
              row.name,
              row.building,
              capacity,
              row.type,
            ]
          );

          imported.push(result.rows[0]);
        } catch (error) {
          if (error.code === "23505") {
            rejected.push({
              row: rowNumber,
              reason: "Room already exists",
              data: row,
            });
          } else {
            throw error;
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          imported_count: imported.length,
          rejected_count: rejected.length,
          imported,
          rejected,
        },
      });
    } catch (error) {
      console.error("Rooms import error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "IMPORT_FAILED",
          message: "Failed to import rooms",
        },
      });
    }
  }
);
app.post(
  "/api/v1/imports/courses",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: "FILE_REQUIRED",
          message: "CSV file is required",
        },
      });
    }

    try {
      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const imported = [];
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        if (!row.course_code || !row.name) {
          rejected.push({
            row: rowNumber,
            reason: "Missing required field",
            data: row,
          });
          continue;
        }

        try {
          const result = await pool.query(
            `
              INSERT INTO courses (
                course_code,
                name
              )
              VALUES ($1, $2)
              RETURNING id, course_code, name
            `,
            [row.course_code, row.name]
          );

          imported.push(result.rows[0]);
        } catch (error) {
          if (error.code === "23505") {
            rejected.push({
              row: rowNumber,
              reason: "Course code already exists",
              data: row,
            });
          } else {
            throw error;
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          imported_count: imported.length,
          rejected_count: rejected.length,
          imported,
          rejected,
        },
      });
    } catch (error) {
      console.error("Courses import error:", error.message);

      return res.status(500).json({
        success: false,
        error: {
          code: "IMPORT_FAILED",
          message: "Failed to import courses",
        },
      });
    }
  }
);

// ======================================================
// CSV IMPORTS - REMAINING RESOURCES
// ======================================================

// 1) IMPORT TEACHING STAFF
app.post(
  "/api/v1/imports/teaching-staff",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FILE_REQUIRED",
            message: "CSV file is required",
          },
        });
      }

      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      let imported = 0;
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        const staffCode = row.staff_code?.trim();
        const name = row.name?.trim();
        const email = row.email?.trim();
        const role = row.role?.trim()?.toLowerCase();

        if (!staffCode || !name || !email || !role) {
          rejected.push({
            row: rowNumber,
            reason: "Missing staff_code, name, email, or role",
          });
          continue;
        }

        if (!["lecturer", "ta"].includes(role)) {
          rejected.push({
            row: rowNumber,
            reason: "Role must be lecturer or ta",
          });
          continue;
        }

        try {
          await pool.query(
            `
            INSERT INTO users
              (email, password_hash, name, role, staff_code, status)
            VALUES
              ($1, $2, $3, $4, $5, 'active')
            `,
            [
              email,
              await bcrypt.hash("TempPassword123!", 10),
              name,
              role,
              staffCode,
            ]
          );

          imported++;
        } catch (err) {
          if (err.code === "23505") {
            rejected.push({
              row: rowNumber,
              reason: "Email or staff_code already exists",
            });
          } else {
            rejected.push({
              row: rowNumber,
              reason: "Database error",
            });
          }
        }
      }

      return res.status(201).json({
        success: true,
        data: {
          imported_count: imported,
          rejected_count: rejected.length,
          rejected_rows: rejected,
        },
      });
    } catch (err) {
      console.error("Teaching staff import error:", err);

      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CSV",
          message: "The uploaded CSV file is invalid",
        },
      });
    }
  }
);


// 2) IMPORT STUDENTS
app.post(
  "/api/v1/imports/students",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FILE_REQUIRED",
            message: "CSV file is required",
          },
        });
      }

      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      let imported = 0;
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        const studentCode = row.student_code?.trim();
        const name = row.name?.trim();
        const email = row.email?.trim();

        if (!studentCode || !name || !email) {
          rejected.push({
            row: rowNumber,
            reason: "Missing student_code, name, or email",
          });
          continue;
        }

        try {
          await pool.query(
            `
            INSERT INTO users
              (email, password_hash, name, role, student_code, status)
            VALUES
              ($1, $2, $3, 'student', $4, 'active')
            `,
            [
              email,
              await bcrypt.hash("TempPassword123!", 10),
              name,
              studentCode,
            ]
          );

          imported++;
        } catch (err) {
          if (err.code === "23505") {
            rejected.push({
              row: rowNumber,
              reason: "Email or student_code already exists",
            });
          } else {
            rejected.push({
              row: rowNumber,
              reason: "Database error",
            });
          }
        }
      }

      return res.status(201).json({
        success: true,
        data: {
          imported_count: imported,
          rejected_count: rejected.length,
          rejected_rows: rejected,
        },
      });
    } catch (err) {
      console.error("Students import error:", err);

      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CSV",
          message: "The uploaded CSV file is invalid",
        },
      });
    }
  }
);


// 3) IMPORT SECTIONS
app.post(
  "/api/v1/imports/sections",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FILE_REQUIRED",
            message: "CSV file is required",
          },
        });
      }

      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      let imported = 0;
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        const sectionCode = row.section_code?.trim();
        const courseCode = row.course_code?.trim();
        const staffCode = row.staff_code?.trim();
        const semester = row.semester?.trim();
        const academicYear = row.academic_year?.trim();

        if (
          !sectionCode ||
          !courseCode ||
          !staffCode ||
          !semester ||
          !academicYear
        ) {
          rejected.push({
            row: rowNumber,
            reason:
              "Missing section_code, course_code, staff_code, semester, or academic_year",
          });
          continue;
        }

        try {
          const course = await pool.query(
            `SELECT id FROM courses WHERE course_code = $1`,
            [courseCode]
          );

          if (course.rows.length === 0) {
            rejected.push({
              row: rowNumber,
              reason: "Course not found",
            });
            continue;
          }

          const staff = await pool.query(
            `
            SELECT id
            FROM users
            WHERE staff_code = $1
              AND role IN ('lecturer', 'ta')
            `,
            [staffCode]
          );

          if (staff.rows.length === 0) {
            rejected.push({
              row: rowNumber,
              reason: "Teaching staff not found",
            });
            continue;
          }

          await pool.query(
            `
            INSERT INTO sections
              (course_id, staff_id, section_code, semester, academic_year)
            VALUES
              ($1, $2, $3, $4, $5)
            `,
            [
              course.rows[0].id,
              staff.rows[0].id,
              sectionCode,
              semester,
              academicYear,
            ]
          );

          imported++;
        } catch (err) {
          if (err.code === "23505") {
            rejected.push({
              row: rowNumber,
              reason: "Section already exists",
            });
          } else {
            rejected.push({
              row: rowNumber,
              reason: "Database error",
            });
          }
        }
      }

      return res.status(201).json({
        success: true,
        data: {
          imported_count: imported,
          rejected_count: rejected.length,
          rejected_rows: rejected,
        },
      });
    } catch (err) {
      console.error("Sections import error:", err);

      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CSV",
          message: "The uploaded CSV file is invalid",
        },
      });
    }
  }
);


// 4) IMPORT ENROLLMENT
app.post(
  "/api/v1/imports/enrollment",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FILE_REQUIRED",
            message: "CSV file is required",
          },
        });
      }

      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      let imported = 0;
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        const studentCode = row.student_code?.trim();
        const sectionCode = row.section_code?.trim();

        if (!studentCode || !sectionCode) {
          rejected.push({
            row: rowNumber,
            reason: "Missing student_code or section_code",
          });
          continue;
        }

        try {
          const student = await pool.query(
            `
            SELECT id
            FROM users
            WHERE student_code = $1
              AND role = 'student'
            `,
            [studentCode]
          );

          if (student.rows.length === 0) {
            rejected.push({
              row: rowNumber,
              reason: "Student not found",
            });
            continue;
          }

          const section = await pool.query(
            `
            SELECT id
            FROM sections
            WHERE section_code = $1
            `,
            [sectionCode]
          );

          if (section.rows.length === 0) {
            rejected.push({
              row: rowNumber,
              reason: "Section not found",
            });
            continue;
          }

          await pool.query(
            `
            INSERT INTO enrollment
              (student_id, section_id, enrolled_at, status)
            VALUES
              ($1, $2, CURRENT_TIMESTAMP, 'active')
            ON CONFLICT (student_id, section_id)
            DO NOTHING
             RETURNING id
            `,
            [
              student.rows[0].id,
              section.rows[0].id,
            ]
          );
          if (enrollmentResult.rows.length === 0) {
  rejected.push({
    row: rowNumber,
    reason: "Student is already enrolled in this section",
  });
  continue;
}

          imported++;
        } catch (err) {
          rejected.push({
            row: rowNumber,
            reason: "Database error",
          });
        }
      }

      return res.status(201).json({
        success: true,
        data: {
          imported_count: imported,
          rejected_count: rejected.length,
          rejected_rows: rejected,
        },
      });
    } catch (err) {
      console.error("Enrollment import error:", err);

      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CSV",
          message: "The uploaded CSV file is invalid",
        },
      });
    }
  }
);


// 5) IMPORT TIMETABLE
app.post(
  "/api/v1/imports/timetable",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FILE_REQUIRED",
            message: "CSV file is required",
          },
        });
      }

      const records = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      let imported = 0;
      const rejected = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2;

        const sectionCode = row.section_code?.trim();
        const roomName = row.room_name?.trim();
        const dayOfWeek = row.day_of_week?.trim();
        const startTime = row.start_time?.trim();
        const endTime = row.end_time?.trim();

        if (
          !sectionCode ||
          !roomName ||
          !dayOfWeek ||
          !startTime ||
          !endTime
        ) {
          rejected.push({
            row: rowNumber,
            reason:
              "Missing section_code, room_name, day_of_week, start_time, or end_time",
          });
          continue;
        }

        const allowedDays = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

if (!allowedDays.includes(dayOfWeek)) {
  rejected.push({
    row: rowNumber,
    reason:
      "day_of_week must be Sun, Mon, Tue, Wed, Thu, Fri, or Sat",
  });
  continue;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
  rejected.push({
    row: rowNumber,
    reason: "start_time and end_time must be valid time values",
  });
  continue;
}

if (startTime >= endTime) {
  rejected.push({
    row: rowNumber,
    reason: "start_time must be earlier than end_time",
  });
  continue;
}

        try {
          const section = await pool.query(
            `
            SELECT id
            FROM sections
            WHERE section_code = $1
            `,
            [sectionCode]
          );

          if (section.rows.length === 0) {
            rejected.push({
              row: rowNumber,
              reason: "Section not found",
            });
            continue;
          }

          const room = await pool.query(
            `
            SELECT id
            FROM rooms
            WHERE name = $1
            `,
            [roomName]
          );

          if (room.rows.length === 0) {
            rejected.push({
              row: rowNumber,
              reason: "Room not found",
            });
            continue;
          }

          await pool.query(
            `
            INSERT INTO timetable
              (section_id, room_id, day_of_week, start_time, end_time)
            VALUES
              ($1, $2, $3, $4, $5)
            `,
            [
              section.rows[0].id,
              room.rows[0].id,
              dayOfWeek,
              startTime,
              endTime,
            ]
          );

          imported++;
        } catch (err) {
          rejected.push({
            row: rowNumber,
            reason: "Database error",
          });
        }
      }

      return res.status(201).json({
        success: true,
        data: {
          imported_count: imported,
          rejected_count: rejected.length,
          rejected_rows: rejected,
        },
      });
    } catch (err) {
      console.error("Timetable import error:", err);

      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CSV",
          message: "The uploaded CSV file is invalid",
        },
      });
    }
  }
);

/* =========================================================
   AUDIT HISTORY
========================================================= */

app.get(
  "/api/v1/audit-events",
  authenticateToken,
  authorizeRole("auditor", "admin"),
  async (req, res) => {
    const {
      entity_type,
      entity_id,
      actor_id,
      from_date,
      to_date,
    } = req.query;

    try {
      const values = [];
      const conditions = [];

      if (entity_type) {
        values.push(entity_type);
        conditions.push(`ae.entity_type = $${values.length}`);
      }

      if (entity_id) {
        values.push(entity_id);
        conditions.push(`ae.entity_id = $${values.length}`);
      }

      if (actor_id) {
        values.push(actor_id);
        conditions.push(`ae.actor_id = $${values.length}`);
      }

      if (from_date) {
        values.push(from_date);
        conditions.push(`ae.created_at::date >= $${values.length}`);
      }

      if (to_date) {
        values.push(to_date);
        conditions.push(`ae.created_at::date <= $${values.length}`);
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const result = await pool.query(
        `
        SELECT
          ae.id,
          ae.actor_id,
          actor.name AS actor_name,
          actor.email AS actor_email,

          ae.action,
          ae.entity_type,
          ae.entity_id,

          ae.before_value,
          ae.after_value,
          ae.reason,
          ae.created_at

        FROM audit_event ae

        LEFT JOIN users actor
          ON actor.id = ae.actor_id

        ${whereClause}

        ORDER BY ae.created_at DESC, ae.id DESC
        `,
        values
      );

      return res.status(200).json({
        success: true,
        data: {
          audit_events: result.rows,
        },
        filters: {
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          actor_id: actor_id || null,
          from_date: from_date || null,
          to_date: to_date || null,
        },
      });
    } catch (error) {
      console.error(
        "Get audit events error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      });
    }
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      success: true,
      message: "Server and database are working",
    });
  } catch (error) {
    console.error("Health check error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Database connection failed",
      },
    });
  }
});

/* =========================================================
   SERVER
========================================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
