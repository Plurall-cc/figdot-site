// FigDot: resize every <iframe data-figdot> to the height its page announces.
addEventListener("message",e=>{const d=e.data;if(!d||d.figdot!=="height"||!(d.height>0))return;
for(const f of document.querySelectorAll("iframe[data-figdot]"))if(f.contentWindow===e.source)f.style.height=Math.ceil(d.height)+"px";});
