import { useState } from 'react'

interface Props {
  value: number
  onChange: (value: number) => void
  size?: 'sm' | 'md'
}

/** 星级控件：点击第 i 颗设为 i 星；点击当前星级清除 */
function RatingStars({ value, onChange, size = 'md' }: Props): React.JSX.Element {
  const [hover, setHover] = useState(0)
  return (
    <div
      className={`stars stars-${size}`}
      onMouseLeave={() => setHover(0)}
      role="radiogroup"
      aria-label="星级"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className={`star${(hover || value) >= i ? ' on' : ''}`}
          title={`${i} 星`}
          onClick={() => onChange(value === i ? 0 : i)}
          onMouseEnter={() => setHover(i)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default RatingStars
