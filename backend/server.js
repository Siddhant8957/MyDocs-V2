require("dotenv").config()

const express = require("express")
const cors = require("cors")
const mysql = require("mysql2")
const multer = require("multer")
const fs = require("fs")
const path = require("path")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const app = express()

// =========================
// PATHS
// =========================

const uploadDir = path.join(__dirname, "uploads")
fs.mkdirSync(uploadDir, { recursive: true })

// =========================
// MIDDLEWARE
// =========================

const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173"

app.use(
  cors({
    origin: allowedOrigin === "*" ? true : allowedOrigin,
  })
)

app.use(express.json())

// =========================
// JWT AUTHENTICATION
// =========================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
    })
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    (err, user) => {
      if (err) {
        return res.status(403).json({
          error: "Invalid or expired token",
        })
      }

      req.user = user
      next()
    }
  )
}

// =========================
// MYSQL CONNECTION POOL
// =========================

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,

  connectTimeout: 30000,
})

// Prevent an idle MySQL connection error from crashing Node.
db.on("error", (err) => {
  console.error("MySQL pool error:", err.message)
})

// =========================
// DATABASE INITIALIZATION
// =========================

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`

const createDocumentsTable = `
  CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    type VARCHAR(255),
    size VARCHAR(100),
    uploadedAt VARCHAR(100),
    filePath VARCHAR(500),
    user_id INT NOT NULL
  )
`

const initializeDatabase = () => {
  db.query("SELECT 1", (err) => {
    if (err) {
      console.error(
        "MySQL connection failed:",
        err.message
      )
      return
    }

    console.log("MySQL connected successfully")

    db.query(
      createUsersTable,
      (usersErr) => {
        if (usersErr) {
          console.error(
            "Users table creation failed:",
            usersErr.message
          )
          return
        }

        console.log("Users table ready")

        db.query(
          createDocumentsTable,
          (documentsErr) => {
            if (documentsErr) {
              console.error(
                "Documents table creation failed:",
                documentsErr.message
              )
              return
            }

            console.log(
              "Documents table ready"
            )

            console.log(
              "Database initialization complete"
            )
          }
        )
      }
    )
  })
}

initializeDatabase()

// =========================
// HEALTH CHECK
// =========================

app.get("/", (req, res) => {
  res.json({
    message: "MyDocs Backend is working!",
  })
})

app.get("/health", (req, res) => {
  db.query("SELECT 1 AS ok", (err) => {
    if (err) {
      return res.status(500).json({
        status: "error",
        message: err.message,
      })
    }

    res.json({
      status: "ok",
      database: "connected",
    })
  })
})

// =========================
// MULTER STORAGE
// =========================

const storage = multer.diskStorage({
  destination: uploadDir,

  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )

    cb(
      null,
      `${Date.now()}-${safeName}`
    )
  },
})

const upload = multer({
  storage,
})

// =========================
// REGISTER
// =========================

app.post(
  "/api/register",
  async (req, res) => {
    const { name, email, password } =
      req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        error:
          "Name, email, and password are required",
      })
    }

    try {
      const normalizedEmail =
        email.toLowerCase().trim()

      const checkSql =
        "SELECT id FROM users WHERE email = ?"

      db.query(
        checkSql,
        [normalizedEmail],
        async (err, results) => {
          if (err) {
            console.error(
              "Register SELECT error:",
              err.message
            )

            return res.status(500).json({
              error: "Database error",
            })
          }

          if (results.length > 0) {
            return res.status(409).json({
              error:
                "Email already registered",
            })
          }

          try {
            const hashedPassword =
              await bcrypt.hash(
                password,
                10
              )

            const insertSql = `
              INSERT INTO users
              (name, email, password)
              VALUES (?, ?, ?)
            `

            db.query(
              insertSql,
              [
                name.trim(),
                normalizedEmail,
                hashedPassword,
              ],
              (
                insertErr,
                result
              ) => {
                if (insertErr) {
                  console.error(
                    "Register INSERT error:",
                    insertErr.message
                  )

                  return res.status(500).json({
                    error:
                      "Registration failed",
                  })
                }

                res.status(201).json({
                  message:
                    "Registration successful",
                  userId:
                    result.insertId,
                })
              }
            )
          } catch (hashErr) {
            console.error(
              "Password hash error:",
              hashErr.message
            )

            return res.status(500).json({
              error:
                "Registration failed",
            })
          }
        }
      )
    } catch (error) {
      console.error(
        "Register error:",
        error.message
      )

      res.status(500).json({
        error: "Database error",
      })
    }
  }
)

// =========================
// LOGIN
// =========================

app.post(
  "/api/login",
  (req, res) => {
    const { email, password } =
      req.body

    if (!email || !password) {
      return res.status(400).json({
        error:
          "Email and password are required",
      })
    }

    const normalizedEmail =
      email.toLowerCase().trim()

    const sql =
      "SELECT * FROM users WHERE email = ?"

    db.query(
      sql,
      [normalizedEmail],
      async (err, results) => {
        if (err) {
          console.error(
            "Login database error:",
            err.message
          )

          return res.status(500).json({
            error: "Database error",
          })
        }

        if (results.length === 0) {
          return res.status(401).json({
            error:
              "Invalid email or password",
          })
        }

        const user = results[0]

        try {
          const passwordMatch =
            await bcrypt.compare(
              password,
              user.password
            )

          if (!passwordMatch) {
            return res.status(401).json({
              error:
                "Invalid email or password",
            })
          }

          const token = jwt.sign(
            {
              userId: user.id,
              email: user.email,
            },
            process.env.JWT_SECRET,
            {
              expiresIn: "1d",
            }
          )

          res.json({
            message:
              "Login successful",

            token,

            user: {
              id: user.id,
              name: user.name,
              email: user.email,
            },
          })
        } catch (error) {
          console.error(
            "Login error:",
            error.message
          )

          res.status(500).json({
            error: "Login failed",
          })
        }
      }
    )
  }
)

// =========================
// GET DOCUMENTS
// =========================

app.get(
  "/api/documents",
  authenticateToken,
  (req, res) => {
    const search =
      req.query.search || ""

    const category =
      req.query.category || "All"

    let sql = `
      SELECT *
      FROM documents
      WHERE user_id = ?
    `

    const values = [
      req.user.userId,
    ]

    if (search) {
      sql += `
        AND (
          name LIKE ?
          OR category LIKE ?
        )
      `

      values.push(
        `%${search}%`,
        `%${search}%`
      )
    }

    if (category !== "All") {
      sql += `
        AND category = ?
      `

      values.push(category)
    }

    sql += `
      ORDER BY id DESC
    `

    db.query(
      sql,
      values,
      (err, results) => {
        if (err) {
          console.error(
            "Documents query error:",
            err.message
          )

          return res.status(500).json({
            error: "Database error",
          })
        }

        res.json(results)
      }
    )
  }
)

// =========================
// UPLOAD DOCUMENT
// =========================

app.post(
  "/api/upload",
  authenticateToken,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      })
    }

    const name =
      req.file.originalname

    const type =
      req.file.mimetype

    const size =
      req.file.size

    const uploadedAt =
      new Date().toLocaleDateString()

    const category =
      req.body.category || "Other"

    const userId =
      req.user.userId

    const filePath =
      "/uploads/" +
      req.file.filename

    const sql = `
      INSERT INTO documents
      (
        name,
        category,
        type,
        size,
        uploadedAt,
        filePath,
        user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `

    db.query(
      sql,
      [
        name,
        category,
        type,
        String(size),
        uploadedAt,
        filePath,
        userId,
      ],
      (err, result) => {
        if (err) {
          console.error(
            "Upload database error:",
            err.message
          )

          return res.status(500).json({
            error: "Database error",
          })
        }

        res.json({
          message:
            "File uploaded and saved successfully",

          id: result.insertId,
        })
      }
    )
  }
)

// =========================
// SECURE VIEW
// =========================

app.get(
  "/api/view/:id",
  authenticateToken,
  (req, res) => {
    const id = req.params.id

    const sql = `
      SELECT filePath
      FROM documents
      WHERE id = ?
      AND user_id = ?
    `

    db.query(
      sql,
      [
        id,
        req.user.userId,
      ],
      (err, results) => {
        if (err) {
          console.error(
            "View database error:",
            err.message
          )

          return res.status(500).json({
            error: "Database error",
          })
        }

        if (results.length === 0) {
          return res.status(404).json({
            error:
              "Document not found",
          })
        }

        const storedPath =
          results[0].filePath

        if (!storedPath) {
          return res.status(404).json({
            error:
              "File not available",
          })
        }

        const filename =
          path.basename(storedPath)

        const fullPath =
          path.join(
            uploadDir,
            filename
          )

        if (
          !fs.existsSync(fullPath)
        ) {
          return res.status(404).json({
            error:
              "File not found",
          })
        }

        res.sendFile(fullPath)
      }
    )
  }
)

// =========================
// SECURE DOWNLOAD
// =========================

app.get(
  "/api/download/:id",
  authenticateToken,
  (req, res) => {
    const id = req.params.id

    const sql = `
      SELECT filePath, name
      FROM documents
      WHERE id = ?
      AND user_id = ?
    `

    db.query(
      sql,
      [
        id,
        req.user.userId,
      ],
      (err, results) => {
        if (err) {
          console.error(
            "Download database error:",
            err.message
          )

          return res.status(500).json({
            error: "Database error",
          })
        }

        if (results.length === 0) {
          return res.status(404).json({
            error:
              "Document not found",
          })
        }

        const storedPath =
          results[0].filePath

        if (!storedPath) {
          return res.status(404).json({
            error:
              "File not available",
          })
        }

        const filename =
          path.basename(storedPath)

        const fullPath =
          path.join(
            uploadDir,
            filename
          )

        if (
          !fs.existsSync(fullPath)
        ) {
          return res.status(404).json({
            error:
              "File not found",
          })
        }

        res.download(
          fullPath,
          results[0].name
        )
      }
    )
  }
)

// =========================
// DELETE DOCUMENT
// =========================

app.delete(
  "/api/documents/:id",
  authenticateToken,
  (req, res) => {
    const id = req.params.id

    const findSql = `
      SELECT filePath, user_id
      FROM documents
      WHERE id = ?
    `

    db.query(
      findSql,
      [id],
      (err, results) => {
        if (err) {
          console.error(
            "Delete lookup error:",
            err.message
          )

          return res.status(500).json({
            error: "Database error",
          })
        }

        if (results.length === 0) {
          return res.status(404).json({
            error:
              "Document not found",
          })
        }

        if (
          results[0].user_id !==
          req.user.userId
        ) {
          return res.status(403).json({
            error:
              "You cannot delete this document",
          })
        }

        const filePath =
          results[0].filePath

        const deleteDocument =
          () => {
            const deleteSql = `
              DELETE FROM documents
              WHERE id = ?
              AND user_id = ?
            `

            db.query(
              deleteSql,
              [
                id,
                req.user.userId,
              ],
              (deleteErr) => {
                if (deleteErr) {
                  console.error(
                    "Delete database error:",
                    deleteErr.message
                  )

                  return res
                    .status(500)
                    .json({
                      error:
                        "Database deletion failed",
                    })
                }

                res.json({
                  message:
                    "Document deleted successfully",
                })
              }
            )
          }

        if (!filePath) {
          deleteDocument()
          return
        }

        const filename =
          path.basename(filePath)

        const fullPath =
          path.join(
            uploadDir,
            filename
          )

        fs.unlink(
          fullPath,
          (fileErr) => {
            if (
              fileErr &&
              fileErr.code !==
                "ENOENT"
            ) {
              return res
                .status(500)
                .json({
                  error:
                    "File deletion failed",
                })
            }

            deleteDocument()
          }
        )
      }
    )
  }
)

// =========================
// START SERVER
// =========================

const PORT =
  process.env.PORT || 3000

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Backend server is running on port ${PORT}`
    )
  }
)
