import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ImagePaperViewer from '../src/ImagePaperViewer.jsx';

const samplePage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const samplePages = [samplePage, samplePage];

const openFullscreen = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open question paper full screen' }));
  return screen.getByRole('dialog', { name: 'Full-screen question paper' });
};

const firePointer = (element, name, values) => {
  const event = new Event(name, { bubbles: true, cancelable: true });
  Object.assign(event, values);
  fireEvent(element, event);
};

afterEach(() => {
  document.body.style.overflow = '';
});

describe('ImagePaperViewer', () => {
  it('offers precise zoom controls and keeps fullscreen to the paper and one close button', async () => {
    render(<ImagePaperViewer pages={samplePages} title="Midterm paper" subjectCode="CS-602" />);

    const zoomSlider = screen.getByRole('slider', { name: 'Question paper zoom' });
    fireEvent.change(zoomSlider, { target: { value: '2.5' } });

    expect(zoomSlider).toHaveValue('2.5');
    expect(screen.getByText('250%')).toBeInTheDocument();
    expect(document.querySelector('.image-paper-scaled-page')).toHaveStyle({ width: '250%' });

    const dialog = openFullscreen();
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByAltText('Question paper page 1')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(
      within(dialog).getByRole('button', { name: 'Close full-screen question paper' })
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('slider')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Full-screen question paper' })).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('');
  });

  it('lets touch dragging reposition the paper', () => {
    const { container } = render(<ImagePaperViewer pages={samplePages} />);
    const stage = container.querySelector('.image-paper-body');
    stage.scrollLeft = 40;
    stage.scrollTop = 50;

    firePointer(stage, 'pointerdown', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    firePointer(stage, 'pointermove', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 60,
      clientY: 70,
      button: 0,
    });

    expect(stage.scrollLeft).toBe(80);
    expect(stage.scrollTop).toBe(80);
  });

  it('supports pinch zoom and swipe page navigation in fullscreen', () => {
    const { container } = render(<ImagePaperViewer pages={samplePages} />);
    const dialog = openFullscreen();
    const stage = dialog.querySelector('.image-paper-fullscreen-stage');

    firePointer(stage, 'pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    firePointer(stage, 'pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
      button: 0,
    });
    firePointer(stage, 'pointermove', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
      button: 0,
    });

    expect(container.querySelector('[aria-label="Question paper zoom"]')).toHaveValue('2');

    firePointer(stage, 'pointerup', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
      button: 0,
    });
    firePointer(stage, 'pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      button: 0,
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close full-screen question paper' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fit question paper to width' }));
    const reopenedDialog = openFullscreen();
    const reopenedStage = reopenedDialog.querySelector('.image-paper-fullscreen-stage');
    firePointer(reopenedStage, 'pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 250,
      clientY: 120,
      button: 0,
    });
    firePointer(reopenedStage, 'pointermove', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 120,
      clientY: 122,
      button: 0,
    });
    firePointer(reopenedStage, 'pointerup', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 120,
      clientY: 122,
      button: 0,
    });

    expect(within(reopenedDialog).getByAltText('Question paper page 2')).toBeInTheDocument();
    expect(within(reopenedDialog).getAllByRole('button')).toHaveLength(1);
  });
});
