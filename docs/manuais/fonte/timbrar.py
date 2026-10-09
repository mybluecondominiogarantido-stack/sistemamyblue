"""Aplica o papel timbrado por baixo de cada página de um PDF.

    python3 timbrar.py conteudo.pdf timbrado.pdf saida.pdf

Precisa do pypdf (pip install pypdf).
"""
import sys

from pypdf import PdfReader, PdfWriter

conteudo, timbrado, saida = sys.argv[1:4]
fundo = PdfReader(timbrado).pages[0]
escritor = PdfWriter()
for pagina in PdfReader(conteudo).pages:
    nova = escritor.add_blank_page(width=pagina.mediabox.width, height=pagina.mediabox.height)
    nova.merge_page(fundo)
    nova.merge_page(pagina)
escritor.add_metadata({'/Producer': 'Portal MyBlue', '/Creator': 'MyBlue Condomínio Garantido'})
escritor.compress_identical_objects()
with open(saida, 'wb') as f:
    escritor.write(f)
