interface PlaceholderProps {
  title: string
}

/** Temporary screen for routes that are implemented in later phases. */
export default function Placeholder({ title }: PlaceholderProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted text-sm">
        This screen will be built in a later phase.
      </p>
    </div>
  )
}
