import { useEffect, useState } from "react"
import heroImg from "./assets/hero.png"
import "./App.css"

const API = "http://localhost:3000"

function App() {
  const [token, setToken] = useState(
    localStorage.getItem("token")
  )

  const [isRegistering, setIsRegistering] =
    useState(false)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authMessage, setAuthMessage] = useState("")

  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [uploadCategory, setUploadCategory] =
    useState("Other")

  const loadDocuments = async () => {
    if (!token) {
      return
    }

    const params = new URLSearchParams()

    if (search.trim() !== "") {
      params.append(
        "search",
        search.trim()
      )
    }

    if (category !== "All") {
      params.append(
        "category",
        category
      )
    }

    try {
      const response = await fetch(
        `${API}/api/documents?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        localStorage.removeItem("token")
        setToken(null)
        return
      }

      const data = await response.json()

      if (Array.isArray(data)) {
        setDocuments(data)
      }
    } catch (error) {
      console.log(
        "Failed to load documents",
        error
      )
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [token, search, category])

  // -------------------------
  // LOGIN / REGISTER
  // -------------------------

  const handleAuth = async () => {
    setAuthMessage("")

    const url = isRegistering
      ? `${API}/api/register`
      : `${API}/api/login`

    const body = isRegistering
      ? {
          name,
          email,
          password,
        }
      : {
          email,
          password,
        }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        setAuthMessage(
          data.error ||
            "Authentication failed"
        )
        return
      }

      if (isRegistering) {
        setAuthMessage(
          "Registration successful. Please login."
        )

        setIsRegistering(false)
        setName("")
        setPassword("")
      } else {
        localStorage.setItem(
          "token",
          data.token
        )

        setToken(data.token)
        setPassword("")
        setAuthMessage("")
      }
    } catch (error) {
      setAuthMessage(
        "Could not connect to backend"
      )
    }
  }

  // -------------------------
  // LOGOUT
  // -------------------------

  const handleLogout = () => {
    localStorage.removeItem("token")
    setToken(null)
    setDocuments([])
  }

  // -------------------------
  // UPLOAD
  // -------------------------

  const handleFileChange = async (
    event
  ) => {
    const file =
      event.target.files[0]

    if (!file) {
      return
    }

    const formData = new FormData()

    formData.append(
      "file",
      file
    )

    formData.append(
      "category",
      uploadCategory
    )

    try {
      const response =
        await fetch(
          `${API}/api/upload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        )

      const data =
        await response.json()

      console.log(data)

      await loadDocuments()

      event.target.value = ""
    } catch (error) {
      console.log(
        "Upload failed",
        error
      )
    }
  }

  // -------------------------
  // VIEW
  // -------------------------

  const handleView = async (doc) => {
    const newWindow =
      window.open(
        "",
        "_blank"
      )

    try {
      const response =
        await fetch(
          `${API}/api/view/${doc.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

      if (!response.ok) {
        newWindow?.close()

        console.log(
          "Unable to view document"
        )

        return
      }

      const blob =
        await response.blob()

      const url =
        URL.createObjectURL(blob)

      if (newWindow) {
        newWindow.location.href =
          url
      }

      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 60000)
    } catch (error) {
      newWindow?.close()

      console.log(
        "View failed",
        error
      )
    }
  }

  // -------------------------
  // DOWNLOAD
  // -------------------------

  const handleDownload =
    async (doc) => {
      try {
        const response =
          await fetch(
            `${API}/api/download/${doc.id}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        if (!response.ok) {
          console.log(
            "Unable to download document"
          )

          return
        }

        const blob =
          await response.blob()

        const url =
          URL.createObjectURL(blob)

        const link =
          window.document.createElement(
            "a"
          )

        link.href = url
        link.download =
          doc.name

        window.document.body.appendChild(
          link
        )

        link.click()
        link.remove()

        setTimeout(() => {
          URL.revokeObjectURL(url)
        }, 1000)
      } catch (error) {
        console.log(
          "Download failed",
          error
        )
      }
    }

  // -------------------------
  // DELETE
  // -------------------------

  const handleDelete =
    async (id) => {
      try {
        const response =
          await fetch(
            `${API}/api/documents/${id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        const data =
          await response.json()

        console.log(data)

        await loadDocuments()
      } catch (error) {
        console.log(
          "Delete failed",
          error
        )
      }
    }

  // -------------------------
  // LOGIN SCREEN
  // -------------------------

  if (!token) {
    return (
      <>
        <div className="hero">
          <img
            src={heroImg}
            className="base"
            width="170"
            height="179"
            alt="MyDocs logo"
          />
        </div>

        <header>
          <h1>MyDocs</h1>
          <p>
            Personal Document Vault
          </p>
        </header>

        <div>
          <h2>
            {isRegistering
              ? "Create Account"
              : "Login"}
          </h2>

          {isRegistering && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value
                )
              }
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
          />

          <button
            onClick={handleAuth}
          >
            {isRegistering
              ? "Register"
              : "Login"}
          </button>

          <button
            onClick={() => {
              setIsRegistering(
                !isRegistering
              )

              setAuthMessage("")
            }}
          >
            {isRegistering
              ? "Already have an account? Login"
              : "Create an account"}
          </button>

          <p>{authMessage}</p>
        </div>
      </>
    )
  }

  // -------------------------
  // MYDOCS VAULT
  // -------------------------

  return (
    <>
      <div className="hero">
        <img
          src={heroImg}
          className="base"
          width="170"
          height="179"
          alt="MyDocs logo"
        />
      </div>

      <header>
        <h1>MyDocs</h1>
        <p>
          Personal Document Vault
        </p>
      </header>

      <button
        onClick={handleLogout}
      >
        Logout
      </button>

      <br />
      <br />

      <input
        type="text"
        placeholder="Search documents..."
        value={search}
        onChange={(event) =>
          setSearch(
            event.target.value
          )
        }
      />

      <br />
      <br />

      <select
        value={uploadCategory}
        onChange={(event) =>
          setUploadCategory(
            event.target.value
          )
        }
      >
        <option value="Personal">
          Personal
        </option>

        <option value="Education">
          Education
        </option>

        <option value="Identity">
          Identity
        </option>

        <option value="Finance">
          Finance
        </option>

        <option value="Work">
          Work
        </option>

        <option value="Other">
          Other
        </option>
      </select>

      <input
        type="file"
        id="fileInput"
        onChange={
          handleFileChange
        }
      />

      <button
        onClick={() =>
          window.document
            .getElementById(
              "fileInput"
            )
            .click()
        }
      >
        + Upload Document
      </button>

      <h3>Categories</h3>

      <div>
        <button
          onClick={() =>
            setCategory("All")
          }
        >
          All
        </button>

        <button
          onClick={() =>
            setCategory(
              "Personal"
            )
          }
        >
          Personal
        </button>

        <button
          onClick={() =>
            setCategory(
              "Education"
            )
          }
        >
          Education
        </button>

        <button
          onClick={() =>
            setCategory(
              "Identity"
            )
          }
        >
          Identity
        </button>

        <button
          onClick={() =>
            setCategory(
              "Finance"
            )
          }
        >
          Finance
        </button>

        <button
          onClick={() =>
            setCategory(
              "Work"
            )
          }
        >
          Work
        </button>

        <button
          onClick={() =>
            setCategory(
              "Other"
            )
          }
        >
          Other
        </button>
      </div>

      <h2>My Documents</h2>

      {documents.length === 0 ? (
        <p>
          No documents found.
        </p>
      ) : (
        documents.map((doc) => (
          <div key={doc.id}>
            <h3>
              {doc.name}
            </h3>

            <p>
              {doc.category}
            </p>

            <p>
              {doc.type}
            </p>

            <p>
              {doc.size}
            </p>

            <p>
              {doc.uploadedAt}
            </p>

            {doc.filePath ? (
              <>
                <button
                  onClick={() =>
                    handleView(
                      doc
                    )
                  }
                >
                  View
                </button>

                <button
                  onClick={() =>
                    handleDownload(
                      doc
                    )
                  }
                >
                  Download
                </button>
              </>
            ) : (
              <p>
                File not available
              </p>
            )}

            <button
              onClick={() =>
                handleDelete(
                  doc.id
                )
              }
            >
              Delete
            </button>
          </div>
        ))
      )}
    </>
  )
}

export default App