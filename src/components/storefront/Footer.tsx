export function Footer() {
  return (
    <footer className="border-t border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm opacity-70">
        <p>Rich G Collection — the modern classic man&apos;s wardrobe.</p>
        <p>&copy; {new Date().getFullYear()} Rich G Collection. All rights reserved.</p>
      </div>
    </footer>
  )
}
