import useEmblaCarousel from 'embla-carousel-react'
import { useState, useEffect } from 'react'
import { PaginationDots } from './PaginationDots.jsx'
import './RecipeCarousel.css'

export function RecipeCarousel({ slides }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false })
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap())
    emblaApi.on('select', onSelect)
    return () => emblaApi.off('select', onSelect)
  }, [emblaApi])

  return (
    <div className="carousel-wrap">
      <div className="carousel-viewport" ref={emblaRef}>
        <div className="carousel-container">
          {slides.map((slide, i) => (
            <div className="carousel-slide" key={i}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      <PaginationDots
        total={slides.length}
        current={current}
        labels={['Overview', 'Ingredients', 'Instructions', 'Nutrition']}
      />
    </div>
  )
}
