import React from "react";

export default function Panel({open, title, onClose, headerExtras=null, children}){
  return (
    <aside className={`panel ${open?'open':''}`} aria-hidden={!open}>
      <div className="panel-header">
        <strong style={{flex:1}}>{title}</strong>
        {headerExtras}
        <button className="btn small" onClick={onClose}>✖</button>
      </div>
      <div className="panel-body">{children}</div>
    </aside>
  );
}
