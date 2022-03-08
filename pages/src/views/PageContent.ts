import { Button } from '../../../ui/components/Button';
import { Div } from '../../../ui/components/Div';
import { pageApi } from '../apis/PageApi';
import { SidebarItemType } from './Sidebar';

export async function PageContent(item: SidebarItemType) {
  const el = Div({
    styles: {
      flexGrow: "1",
    },
  });

  const page = await pageApi.getById(item._id);

  const title = Div({
    innerText: page.body,
  });
  el.append(title);

  const addTextButton = Button({
    innerText: "+",
    onClick: async () => {
      const newTextContent = await pageApi.create({
        type: "text",
        parent: page._id,
        body: "",
      });
      addContent(newTextContent, true);
    },
  });
  el.append(addTextButton);

  const content = page.content || [];
  for (const contentId of content) {
    const content = await pageApi.getById(contentId);

    addContent(content);
  }

  function addContent(content, focusText = false) {
    const noteContentEl = Div({
      styles: {
        display: "flex",
      },
    });
    el.append(noteContentEl);

    const noteBodyEl = Div({
      innerText: content.body,
      styles: {
        width: "100%",
      },
    });

    noteBodyEl.contentEditable = "true";

    if (focusText) {
      setTimeout(function () {
        noteBodyEl.focus();
      }, 0);
    }

    const intervalId = setInterval(() => {
      if (content.body !== noteBodyEl.innerText) {
        pageApi
          .update(content._id, {
            body: noteBodyEl.innerText,
          })
          .catch((err) => {
            alert(err.message);
          });
        content.body = noteBodyEl.innerText;
      }
    }, 3000);

    el.addEventListener("DOMNodeRemoved", (e) => {
      if (e.target !== el) {
        return;
      }
      clearInterval(intervalId);
    });

    noteContentEl.append(noteBodyEl);

    const removeBtn = Button({
      innerText: "-",
      onClick() {
        pageApi.removeById(content._id);
        noteContentEl.remove();
      },
    });
    noteContentEl.append(removeBtn);
  }

  return el;
}
