import FlipCard from '../FlipCard'

// Let both faces size the grid so long questions and answers remain readable.
const faceClassName = 'flex min-h-64 h-full flex-col items-center justify-center gap-6 rounded-lg border border-line bg-paper p-8 text-center text-ink'

const Flashcard = ({ front, back, revealed, onReveal }) => (
  <FlipCard
    flipped={revealed}
    onFlipChange={onReveal}
    ariaLabel={revealed ? 'Show question' : 'Show answer'}
    axis="y"
    flipOnClick
    draggable
    dragDistance={0}
    tilt
    tiltMax={12}
    glare
    glareOpacity={0.22}
    hoverScale={1.03}
    perspective={1100}
    stiffness={170}
    damping={20}
    shadow
    shadowColor="#000000"
    shadowOpacity={0.45}
    radius={8}
    background="var(--color-paper)"
    color="var(--color-ink)"
    className="w-full! h-auto! [&>div]:relative! [&>div]:grid [&>div>div]:relative! [&>div>div]:col-start-1 [&>div>div]:row-start-1 focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
    front={(
      <div className={faceClassName}>
        <p className="w-full text-lg text-ink wrap-anywhere">{front}</p>
        <span className="text-sm text-muted-foreground">Click to show the answer</span>
      </div>
    )}
    back={(
      <div className={faceClassName}>
        <p className="w-full text-lg text-ink wrap-anywhere">{back}</p>
      </div>
    )}
  />
)

export default Flashcard
