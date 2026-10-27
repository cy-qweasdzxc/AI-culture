import { useState } from 'react'
import type { ImgHTMLAttributes } from 'react'

function ImageContent({ src, alt, className = '', onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false)
  if (failed || !src)
    return <div role="img" aria-label={`${alt || '图片'}（暂不可用）`}
      className={`image-placeholder ${className}`} style={props.style}>图片暂不可用</div>
  return <img {...props} src={src} alt={alt} className={className} onError={(event) => {
    setFailed(true)
    onError?.(event)
  }} />
}

/** Reset failure state when a new resource is selected; never retry in an error loop. */
export default function ResilientImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <ImageContent key={props.src} {...props} />
}
