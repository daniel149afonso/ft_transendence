import { useRef, useState, useEffect } from "react"
import Phaser from "phaser"
import { gameConfig } from "./game/config"

export default function App() {
  const [muted, setMuted] = useState(true)
  const [modal, setModal] = useState<string | null>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted
      setMuted(!muted)
    }
  }

  const handleLogin = () => {
    setModal(null)
    setGameStarted(true)
  }

  useEffect(() => {
    if (!gameStarted) return
    import("./game.css")
    const game = new Phaser.Game(gameConfig)
    return () => { game.destroy(true) }
  }, [gameStarted])

  if (gameStarted) {
    return <div id="game-container"></div>
  }

  return (
    <>
      <div className="menu">
        <video ref={videoRef} className="menu-video" autoPlay muted loop playsInline>
          <source src="/background.mp4" type="video/mp4" />
        </video>

        <button onClick={toggleMute} style={{ position: "absolute", top: 16, right: 16, width: "auto", padding: "8px 16px", zIndex: 10 }}>
          {muted ? "🔇" : "🔊"}
        </button>

        <img src="/title.png" alt="ZELDOU" className="title"/>
        <button onClick={() => setModal("play")}>Play</button>
        <button onClick={() => setModal("Options")}>Options</button>
        <button onClick={() => setModal("leaderboard")}>Leaderboard</button>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            {modal === "play" && (
              <>
                <h2>Play</h2>
                <input type="text" placeholder="Username" className="rpg-input" />
                <input type="password" placeholder="Password" className="rpg-input" />
                <button onClick={handleLogin}>Login</button>
                <div className="modal-buttons-row">
                  <button>Create account</button>
                  <button onClick={() => setModal(null)}>Close</button>
                </div>
              </>
            )}

            {modal === "Options" && (
              <>
                <h2>Options</h2>
                <label>Master Volume</label>
                <input type="range" min="0" max="100" />
                <label>Music Volume</label>
                <input type="range" min="0" max="100" />
                <label>Dialogue Volume</label>
                <input type="range" min="0" max="100" />
                <button onClick={() => setModal(null)}>Close</button>
              </>
            )}

            {modal === "leaderboard" && (
              <>
                <h2>Leaderboard</h2>
                <div style={{ maxHeight: "300px", overflowY: "scroll" }}>
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Guild</th>
                        <th>Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td>1</td><td>Glorp</td><td>—</td><td>42</td></tr>
                      <tr><td>2</td><td>Feur</td><td>Sigma</td><td>38</td></tr>
                      <tr><td>3</td><td>Test</td><td>—</td><td>35</td></tr>
                      <tr><td>4</td><td>Bonjour</td><td>42</td><td>31</td></tr>
                      <tr><td>5</td><td>Allo</td><td>—</td><td>28</td></tr>
                      <tr><td>6</td><td>Caca</td><td>Sigma</td><td>22</td></tr>
                      <tr><td>7</td><td>oups</td><td>—</td><td>21</td></tr>
                      <tr><td>8</td><td>test123</td><td>—</td><td>15</td></tr>
                      <tr><td>9</td><td>hip</td><td>—</td><td>10</td></tr>
                      <tr><td>10</td><td>Noob</td><td>—</td><td>1</td></tr>
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setModal(null)}>Close</button>
              </>
            )}

          </div>
        </div>
      )}
    </>
  )
}