"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Download, X } from "lucide-react"

type ImagePreviewDialogProps = {
  image: { url: string; name: string } | null
  onClose: () => void
  onDownload: (url: string, name: string) => void
}

export function ImagePreviewDialog({ image, onClose, onDownload }: ImagePreviewDialogProps) {
  return (
    <Dialog open={!!image} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-none overflow-hidden">
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 text-white/70 hover:text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
          
          {/* Download button */}
          {image && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-12 z-10 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => onDownload(image.url, image.name)}
            >
              <Download className="w-5 h-5" />
            </Button>
          )}
          
          {/* Image */}
          {image && (
            <img
              src={image.url}
              alt={image.name}
              className="max-w-full max-h-[85vh] object-contain"
            />
          )}
          
          {/* File name */}
          {image && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
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
