import { ArrowDown, ArrowUp, CaretRight } from '@phosphor-icons/react';
import { type QualityReview, qualityColor } from '../shared/quality';

/** How the review agent scored this session, written for the student. */
export function QualityCard({ review }: { review: QualityReview }) {
  const hasDetails =
    review.overview || review.went_well.length > 0 || review.hurt_quality.length > 0;
  return (
    <details className="surface group mx-3 my-2 shrink-0 px-3.5 py-2.5">
      <summary
        className={`flex list-none items-center gap-2 text-sm ${hasDetails ? 'cursor-pointer' : ''}`}
      >
        <span className="text-text-muted">Quality</span>
        <span className={`font-semibold tabular-nums ${qualityColor(review.quality_score)}`}>
          {review.quality_score}
        </span>
        <span className="text-xs text-text-faint">out of 100</span>
        {hasDetails && (
          <CaretRight
            size={14}
            className="ml-auto text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
        )}
      </summary>
      {hasDetails && (
        <div className="mt-2 space-y-3 pb-1 text-xs">
          {review.overview && <p className="leading-relaxed text-text-muted">{review.overview}</p>}
          <Points items={review.went_well} up />
          <Points items={review.hurt_quality} up={false} />
          {review.step_notes.length > 0 && (
            <p className="text-text-faint">Steps marked in the list below show where it changed.</p>
          )}
        </div>
      )}
    </details>
  );
}

function Points({ items, up }: { items: string[]; up: boolean }) {
  if (!items.length) return null;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <div>
      <p className="mb-1 font-medium text-text">
        {up ? 'Raised your score' : 'Lowered your score'}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-text-muted">
            <Icon
              size={12}
              weight="bold"
              className={`mt-0.5 shrink-0 ${up ? 'text-green' : 'text-coral'}`}
              aria-label={up ? 'Raised' : 'Lowered'}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
