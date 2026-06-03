import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './InstructionsEditor.css'

function Row({ item, index, editor }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style} className="ins-row">
      <button className="ins-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
      <span className="ins-row__num">{index + 1}.</span>
      <textarea className="ins-row__text" value={item.text} aria-label="Instruction step" rows={2}
        onChange={(e) => editor.editInstruction(item.id, e.target.value)} />
      <button className="ins-btn ins-btn--danger" aria-label="Delete step"
        onClick={() => editor.deleteInstruction(item.id)}>Del</button>
    </li>
  )
}

export function InstructionsEditor({ editor, items, onClose }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) editor.reorderInstructions(active.id, over.id)
  }
  return (
    <div className="ins-editor" role="dialog" aria-label="Edit instructions">
      <header className="ins-editor__header">
        <span>Edit instructions</span>
        <button className="ins-editor__close" onClick={onClose} aria-label="Close">Close</button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="ins-editor__list">
            {items.map((item, index) => <Row key={item.id} item={item} index={index} editor={editor} />)}
          </ol>
        </SortableContext>
      </DndContext>
      <footer className="ins-editor__footer">
        <button className="ins-btn ins-btn--add" onClick={editor.addInstruction} aria-label="Add step">+ Add step</button>
        <button className="ins-btn ins-btn--done" onClick={onClose} aria-label="Done editing instructions">Done</button>
      </footer>
    </div>
  )
}
