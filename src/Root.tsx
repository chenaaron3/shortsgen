import React, { useEffect, useState } from "react";
import { staticFile } from "remotion";
import { ShortVideoComposition } from "./ShortVideo";

export const RemotionRoot: React.FC = () => {
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);

  useEffect(() => {
    const indexUrl = staticFile("shortgen/index.json");
    fetch(indexUrl)
      .then((res) => (res.ok ? res.json() : { cacheKeys: [] }))
      .then((data: { cacheKeys?: string[] }) =>
        setCacheKeys(data.cacheKeys ?? [])
      )
      .catch(() => setCacheKeys([]));
  }, []);

  return (
    <>
      {cacheKeys.length > 0
        ? cacheKeys.map((key) => (
            <ShortVideoComposition key={key} cacheKey={key} />
          ))
        : <ShortVideoComposition />}
    </>
  );
};
