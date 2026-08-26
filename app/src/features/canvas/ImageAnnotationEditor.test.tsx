import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { ImageAnnotation } from '../project/model'
import { drawImageAnnotations, ImageAnnotationOverlay } from './ImageAnnotationEditor'

describe('image annotation rendering', () => {
  test('draws geometry, brush, arrow, and text with normalized coordinates', () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      ellipse: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '',
    } as unknown as CanvasRenderingContext2D
    const annotations: ImageAnnotation[] = [
      { id: 'rect', kind: 'rectangle', color: '#f00', lineWidth: 2, start: { x: 0.1, y: 0.2 }, end: { x: 0.5, y: 0.6 } },
      { id: 'circle', kind: 'ellipse', color: '#0f0', lineWidth: 3, start: { x: 0.2, y: 0.2 }, end: { x: 0.8, y: 0.8 } },
      { id: 'arrow', kind: 'arrow', color: '#00f', lineWidth: 4, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      { id: 'brush', kind: 'brush', color: '#fff', lineWidth: 5, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.3 }] },
      { id: 'text', kind: 'text', color: '#fc0', lineWidth: 2, point: { x: 0.25, y: 0.75 }, text: '重点' },
    ]

    drawImageAnnotations(context, annotations, 1000, 500)

    expect(context.strokeRect).toHaveBeenCalledOnce()
    expect(vi.mocked(context.strokeRect).mock.calls[0]).toEqual([
      100,
      100,
      400,
      expect.closeTo(200),
    ])
    expect(context.ellipse).toHaveBeenCalled()
    expect(context.lineTo).toHaveBeenCalledWith(1000, 500)
    expect(context.fillText).toHaveBeenCalledWith('重点', 250, 375)
  })

  test('renders saved annotations as a non-interactive node overlay', () => {
    render(
      <ImageAnnotationOverlay
        annotations={[
          { id: 'label', kind: 'text', color: '#fff', lineWidth: 2, point: { x: 0.5, y: 0.5 }, text: '人物' },
        ]}
      />,
    )
    expect(screen.getByLabelText('1 个图片标注')).toHaveTextContent('人物')
  })
})
