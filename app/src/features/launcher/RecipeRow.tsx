export type RecipeId =
  | 'cinematic-story'
  | 'brand-atmosphere'
  | 'character-teaser'

export interface RecipeRowProps {
  id: RecipeId
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (recipeId: RecipeId) => void
}

export function RecipeRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: RecipeRowProps) {
  const descriptionId = `recipe-${id}-description`

  return (
    <label className="recipe-row">
      <input
        className="recipe-row__radio focus-visible"
        type="radio"
        name="recipe"
        value={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={() => onChange(id)}
      />
      <span className="recipe-row__copy">
        <span className="recipe-row__title">{title}</span>
        <span id={descriptionId} className="recipe-row__description">
          {description}
        </span>
      </span>
    </label>
  )
}
