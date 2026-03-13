const categories = ['Trending', 'New', 'Sports', 'Crypto'] as const

export type Category = (typeof categories)[number]

export function CategoryBar({
  active,
  onSelect,
}: {
  active: Category
  onSelect: (cat: Category) => void
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            active === cat
              ? 'text-amber-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
