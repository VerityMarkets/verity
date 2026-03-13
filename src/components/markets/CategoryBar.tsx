import { categories } from '@/categories'

export type Category = string

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
        <span key={cat.id} className="contents">
          {cat.dividerBefore && <span className="w-px h-4 bg-white/10 mx-1 shrink-0" />}
          <button
            onClick={() => onSelect(cat.id)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              active === cat.id
                ? 'text-amber-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {cat.label}
          </button>
        </span>
      ))}
    </div>
  )
}
