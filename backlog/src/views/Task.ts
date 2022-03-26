import { Div } from "../../../ui/components/Div";
import { TaskType } from "../types/TaskType";

export type TaskProps = {
  task: TaskType;
  onDrag?: (task: TaskType) => void;
  onDrop?: (task: TaskType) => void;
  onBlur?: (task: TaskType) => void;
  onClick?: (task: TaskType) => void;
};

export function Task({ task, onClick, onDrag, onDrop, onBlur }: TaskProps) {
  const el = Div({
    innerText: task.body,
    styles: {
      position: "relative",
      border: "1px solid black",
      marginBottom: "4px",
      padding: "4px",
    },
    onClick: () => {
      onClick(task);
    },
  });
  el.contentEditable = "true";
  el.draggable = true;
  el.ondrag = () => {
    onDrag(task);
  };

  el.ondragover = (e) => {
    el.style.borderColor = "red";
    e.preventDefault();
  };

  el.ondragleave = (e) => {
    el.style.borderColor = "black";
  };

  el.ondrop = (e) => {
    el.style.borderColor = "black";
    onDrop(task);
  };

  el.onblur = () => {
    onBlur(task);
  };

  return el;
}