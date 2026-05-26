import { useRef, useState, useEffect } from "react"
import Phaser from "phaser"
import { gameConfig } from "./game/config"

function PlayModal({ onLogin, onClose }: { onLogin: () => void; onClose: () => void }) {
  return (
    <>
      <h2>Play</h2>
      <input type="text" placeholder="Username" className="rpg-input" />
      <input type="password" placeholder="Password" className="rpg-input" />
      <button onClick={onLogin}>Login</button>
      <div className="modal-buttons-row">
        <button>Create account</button>
        <button onClick={onClose}>Close</button>
      </div>
    </>
  )
}

function OptionsModal({ onClose, audioRef }: { 
  onClose: () => void
  audioRef: React.RefObject<HTMLAudioElement | null>
}) {
  const currentMusicVolume = audioRef.current?.volume ?? 0.5

  const handleMusicVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.volume = Number(e.target.value) / 100
    }
  }

  return (
    <>
      <h2>Options</h2>
      <label>Master Volume</label>
      <input type="range" min="0" max="100" />
      <label>Music Volume</label>
      <input type="range" min="0" max="100"
        defaultValue={currentMusicVolume * 100}
        onChange={handleMusicVolume} />
      <label>Dialogue Volume</label>
      <input type="range" min="0" max="100" />
      <button onClick={onClose}>Close</button>
    </>
  )
}

function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const rows = [
    { rank: 1,  name: "Glorp",   guild: "—",     level: 42 },
    { rank: 2,  name: "Feur",    guild: "Sigma",  level: 38 },
    { rank: 3,  name: "Test",    guild: "—",      level: 35 },
    { rank: 4,  name: "Bonjour", guild: "42",     level: 31 },
    { rank: 5,  name: "Allo",    guild: "—",      level: 28 },
    { rank: 6,  name: "Caca",    guild: "Sigma",  level: 22 },
    { rank: 7,  name: "oups",    guild: "—",      level: 21 },
    { rank: 8,  name: "test123", guild: "—",      level: 15 },
    { rank: 9,  name: "hip",     guild: "—",      level: 10 },
    { rank: 10, name: "Noob",    guild: "—",      level: 1  },
  ]

  return (
    <>
      <h2>Leaderboard</h2>
      <div className="leaderboard-scroll">
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
            {rows.map((row) => (
              <tr key={row.rank}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.guild}</td>
                <td>{row.level}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onClose}>Close</button>
    </>
  )
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={() => { playClick(); onClick() }}>
      {children}
    </button>
  )
}

const playClick = () => {
  const audio = new Audio("/click.mp3")
  audio.volume = 0.5
  audio.play()
}

//Menu

type ModalType = "play" | "options" | "leaderboard" | null

export default function App() {
  const [muted, setMuted] = useState(true)
  const [modal, setModal] = useState<ModalType>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const toggleMute = () => {
  if (audioRef.current) {
    if (muted) {
      audioRef.current.muted = false
      audioRef.current.play()
    } else {
      audioRef.current.muted = true
    }
    setMuted(!muted)
  }
  playClick()
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

  useEffect(() => {
  if (audioRef.current) {
    audioRef.current.volume = 0.5
  }
}, [])

  if (gameStarted) {
    return <div id="game-container" />
  }

  return (
    <>
      <audio ref={audioRef} src="/music.m4a" autoPlay loop muted />

      <div className="menu">
        <video className="menu-video" autoPlay muted loop playsInline>
          <source src="/background.mp4" type="video/mp4" />
        </video>

        <button className="mute-button" onClick={toggleMute}>
          {muted ? "🔇" : "🔊"}
        </button>

        <img src="/title.png" alt="ZELDOU" className="title" />
        <MenuButton onClick={() => setModal("play")}>Play</MenuButton>
        <MenuButton onClick={() => setModal("options")}>Options</MenuButton>
        <MenuButton onClick={() => setModal("leaderboard")}>Leaderboard</MenuButton>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => {
            if ((e.target as HTMLElement).tagName === "BUTTON") playClick()
            e.stopPropagation()
          }}>
            {modal === "play"        && <PlayModal onLogin={handleLogin} onClose={() => setModal(null)} />}
            {modal === "options" && <OptionsModal onClose={() => setModal(null)} audioRef={audioRef} />}
            {modal === "leaderboard" && <LeaderboardModal onClose={() => setModal(null)} />}
          </div>
        </div>
      )}
    </>
  )
}