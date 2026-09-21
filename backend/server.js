const express = require("express");
const pool = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = 3000;

app.use(express.json());

const authenticateToken = require("./middleware/authMiddleware");

const authorizeRole = require("./middleware/roleMiddleware");

app.post("/api/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user) {
  return res.status(401).json({
    success: false,
    error: {
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
    },
  });
}

const passwordValid = await bcrypt.compare(
  password,
  user.password_hash
);

if (!passwordValid) {
  return res.status(401).json({
    success: false,
    error: {
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
    },
  });
}

    const accessToken = jwt.sign(
  {
    userId: user.id,
    role: user.role,
  },
  process.env.JWT_SECRET,
  {
    expiresIn: "1h",
  }
);

res.json({
  success: true,
  data: {
    access_token: accessToken,
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

    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      },
    });
  }
});

app.get(
  "/api/v1/protected",
  authenticateToken,
  authorizeRole("lecturer"),
  (req, res) => {  res.json({
    success: true,
    message: "You are authenticated",
    user: req.user,
  });
});

app.get(
  "/api/v1/users",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
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
        ORDER BY id`
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get users error:", error.message);

      res.status(500).json({
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
  "/api/v1/courses",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, course_code, name
        FROM courses
        ORDER BY id
      `);

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get courses error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

app.get(
  "/api/v1/sections",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, course_id, section_code, semester, academic_year
        FROM sections
        ORDER BY id
      `);

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get sections error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

app.get(
  "/api/v1/sections/:sectionId/students",
  authenticateToken,
  async (req, res) => {
    const { sectionId } = req.params;

    try {
      const sectionResult = await pool.query(
        "SELECT id FROM sections WHERE id = $1",
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
          u.student_code,
          u.name
        FROM enrollment e
        JOIN users u ON u.id = e.student_id
        WHERE e.section_id = $1
        ORDER BY u.id
        `,
        [sectionId]
      );

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get section students error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          c.course_code,
          c.name AS course_name,
          s.section_code,
          ats.started_at,
          ats.ended_at,
          ae.scanned_at,
          ae.attendance_status,
          ae.validation_status,
          ae.rejection_reason
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
        ORDER BY ats.started_at DESC
        `,
        [studentId]
      );

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get student attendance error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          status,
          created_at,
          updated_at
        FROM users
        WHERE role IN ('lecturer', 'ta')
        ORDER BY id
        `
      );

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get staff error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          AND role IN ('lecturer', 'ta')
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

      res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Get staff profile error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          s.id AS section_id,
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

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get staff sections error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          t.id AS timetable_id,
          s.id AS section_id,
          s.section_code,
          c.course_code,
          c.name AS course_name,
          r.id AS room_id,
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

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get staff timetable error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          c.id AS course_id,
          c.course_code,
          c.name AS course_name,
          s.staff_id,
          u.name AS staff_name,
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
        JOIN users u
          ON u.id = s.staff_id
        JOIN rooms r
          ON r.id = t.room_id
        ORDER BY t.id
        `
      );

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Get timetable error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
            message: "Timetable not found",
          },
        });
      }

      const timetable = timetableResult.rows[0];

      if (Number(timetable.staff_id) !== Number(staffId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You are not assigned to this section",
          },
        });
      }

      const activeSession = await pool.query(
        `
        SELECT id
        FROM attendance_session
        WHERE timetable_id = $1
          AND status = 'open'
        LIMIT 1
        `,
        [timetable_id]
      );

      if (activeSession.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: "SESSION_ALREADY_OPEN",
            message: "An attendance session is already open",
          },
        });
      }

      const result = await pool.query(
        `
        INSERT INTO attendance_session
          (
            timetable_id,
            opened_by,
            started_at,
            status,
            qr_secret_version,
            week_number
          )
        VALUES
          ($1, $2, CURRENT_TIMESTAMP, 'open', 1, 1)
        RETURNING *
        `,
        [timetable_id, staffId]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Open attendance session error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

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
          ats.id,
          ats.opened_by,
          ats.status
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

      const result = await pool.query(
        `
        UPDATE attendance_session
        SET
          ended_at = CURRENT_TIMESTAMP,
          status = 'closed'
        WHERE id = $1
        RETURNING *
        `,
        [sessionId]
      );

      res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Close attendance session error:", error.message);

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    message: "Smart Attendance API is running",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});