import { useEffect, useState } from 'react';
import { getScreenshot } from '../shared/storage/db';

export function useScreenshot(hash: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;

    getScreenshot(hash)
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else {
          setUrl(null);
        }
      })
      .catch(() => {
        setUrl(null);
      });

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [hash]);

  return url;
}
