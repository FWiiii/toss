'use client'

import { Download, X } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface ImagePreviewDialogProps {
  image: { url: string, name: string } | null
  onClose: () => void
  onDownload: (url: string, name: string) => void
}

export function ImagePreviewDialog({ image, onClose, onDownload }: ImagePreviewDialogProps) {
  return (
    <Dialog open={!!image} onOpenChange={() => onClose()}>
      <DialogContent
        className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-none overflow-hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <div className="relative w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10 rounded-full bg-black/28 text-white/80 backdrop-blur transition-all duration-200 hover:bg-white/18 hover:text-white"
            onClick={onClose}
            aria-label="关闭图片预览"
            title="关闭图片预览"
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Download button */}
          {image && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-16 z-10 rounded-full bg-black/28 text-white/80 backdrop-blur transition-all duration-200 hover:bg-white/18 hover:text-white"
              onClick={() => onDownload(image.url, image.name)}
              aria-label={`下载图片 ${image.name}`}
              title={`下载图片 ${image.name}`}
            >
              <Download className="w-5 h-5" />
            </Button>
          )}

          {/* Image */}
          {image && (
            <div className="relative h-[85vh] w-full">
              <Image
                key={image.url}
                src={image.url}
                alt={image.name}
                fill
                unoptimized
                sizes="90vw"
                className="object-contain delight-preview-in"
              />
            </div>
          )}

          {/* File name */}
          {image && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/55 to-transparent delight-fade-up">
              <p className="text-white/90 text-sm text-center truncate">
                {image.name}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
