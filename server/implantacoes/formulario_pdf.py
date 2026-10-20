#!/usr/bin/env python3
"""
Formulário de Implantação em PDF (A4 retrato), no visual do Retorno de Análise de Crédito:
logo, canto azul, rodapé com os contatos e o número da página.

  python3 formulario_pdf.py <dados.json> <saida.pdf> <logo.png>

O conteúdo vem pronto do portal (server/implantacoes/formulario-pdf.js): cabeçalho, faixa do condomínio,
diferenças em relação à análise, seções com pares rótulo/valor e tabelas, documentos e andamento do setor.
"""
import sys
import json
import os
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, KeepTogether

COR_PRIMARIA = HexColor("#1B9BBC")
COR_ESCURA = HexColor("#0E5C73")
COR_CLARA = HexColor("#EBF5F9")
COR_BORDA = HexColor("#B8D8E2")
COR_TEXTO = HexColor("#2C3E50")
COR_LEVE = HexColor("#5A6770")
COR_LARANJA = HexColor("#F2A93B")
COR_LARANJA_BG = HexColor("#FFF4E0")
COR_VERDE = HexColor("#2B7A55")
COR_PEND = HexColor("#9A5B05")

PAGE_W, PAGE_H = A4
MARG = 1.6 * cm
LARG = PAGE_W - 2 * MARG

with open(sys.argv[1], encoding="utf-8") as f:
    DADOS = json.load(f)
SAIDA = sys.argv[2]
LOGO = sys.argv[3] if len(sys.argv) > 3 else ""

E = lambda s: escape(str(s if s is not None else ""))
estilo = lambda nome, **k: ParagraphStyle(nome, fontName=k.pop("fonte", "Helvetica"), textColor=k.pop("cor", COR_TEXTO), **k)
S_ROT = estilo("rot", fontSize=8, leading=10, cor=COR_LEVE)
S_VAL = estilo("val", fonte="Helvetica-Bold", fontSize=9, leading=11.5)
S_TXT = estilo("txt", fontSize=9, leading=12)
S_PEQ = estilo("peq", fontSize=8, leading=10.5, cor=COR_LEVE)
S_SEC = estilo("sec", fonte="Helvetica-Bold", fontSize=9.5, leading=12, cor=COR_ESCURA)
S_TAB_CAB = estilo("tcab", fonte="Helvetica-Bold", fontSize=8, leading=10, cor=COR_ESCURA)
S_TAB = estilo("tab", fontSize=8.5, leading=10.5)


def decorar(c, doc):
    c.saveState()
    # canto azul (como no retorno da análise)
    c.setFillColor(COR_CLARA)
    p = c.beginPath()
    p.moveTo(PAGE_W - 70, PAGE_H); p.lineTo(PAGE_W, PAGE_H); p.lineTo(PAGE_W, PAGE_H - 70); p.close()
    c.drawPath(p, fill=1, stroke=0)
    c.setStrokeColor(COR_PRIMARIA); c.setLineWidth(0.8)
    c.line(PAGE_W - 60, PAGE_H - 5, PAGE_W - 5, PAGE_H - 60)
    if LOGO and os.path.exists(LOGO):
        c.drawImage(LOGO, MARG, PAGE_H - MARG - 30, width=120, height=36, mask="auto", preserveAspectRatio=True, anchor="sw")
    c.setFillColor(COR_PRIMARIA); c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - MARG - 40, PAGE_H - MARG - 6, "FORMULÁRIO DE IMPLANTAÇÃO")
    c.setFillColor(COR_ESCURA); c.setFont("Helvetica-Bold", 13)
    c.drawRightString(PAGE_W - MARG - 40, PAGE_H - MARG - 21, DADOS.get("protocolo") or "Rascunho")
    c.setFillColor(COR_LEVE); c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - MARG - 40, PAGE_H - MARG - 32, DADOS.get("emitido", ""))
    # rodapé
    c.setStrokeColor(COR_BORDA); c.setLineWidth(0.4)
    c.line(MARG, MARG - 4, PAGE_W - MARG, MARG - 4)
    c.setFillColor(COR_LEVE); c.setFont("Helvetica", 7.5)
    c.drawString(MARG, MARG - 14, "MyBlue Condomínio Garantido  |  contato@myblue.com.br  |  www.myblue.com.br  |  (85) 4042.9277")
    c.drawRightString(PAGE_W - MARG, MARG - 14, f"Página {doc.page}")
    c.restoreState()


def secao(numero, titulo):
    rotulo = f"{numero}  ·  {titulo.upper()}" if numero else titulo.upper()
    t = Table([[Paragraph(E(rotulo), S_SEC)]], colWidths=[LARG])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), COR_CLARA), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t


def pares(campos):
    """rótulo/valor em duas colunas"""
    linhas, atual = [], []
    for rot, val in campos:
        atual += [Paragraph(E(rot), S_ROT), Paragraph(E(val) if val not in (None, "") else "—", S_VAL)]
        if len(atual) == 4:
            linhas.append(atual); atual = []
    if atual:
        linhas.append(atual + [""] * (4 - len(atual)))
    if not linhas:
        return None
    t = Table(linhas, colWidths=[LARG * 0.2, LARG * 0.3, LARG * 0.2, LARG * 0.3])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, COR_BORDA), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    return t


def tabela(cab, linhas, larguras=None, cores=None):
    corpo = [[Paragraph(E(c), S_TAB_CAB) for c in cab]]
    for lin in linhas:
        corpo.append([Paragraph(E(c), S_TAB) for c in lin])
    n = len(cab)
    t = Table(corpo, colWidths=[LARG * w for w in (larguras or [1.0 / n] * n)], repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), COR_CLARA), ("GRID", (0, 0), (-1, -1), 0.5, COR_BORDA), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    for (lin, col, cor) in (cores or []):
        st.append(("TEXTCOLOR", (col, lin + 1), (col, lin + 1), HexColor(cor)))
    t.setStyle(TableStyle(st))
    return t


def caixa(texto, borda, fundo):
    t = Table([[Paragraph(texto, S_TXT)]], colWidths=[LARG])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, borda), ("BACKGROUND", (0, 0), (-1, -1), fundo),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t


historia = [Spacer(1, 8)]
faixa = Table([[Paragraph(f'<font color="#FFFFFF" size="15"><b>{E(DADOS.get("condominio"))}</b></font>', S_TXT)],
               [Paragraph(f'<font color="#D7EEF5">{E(DADOS.get("subtitulo"))}</font>', S_TXT)]], colWidths=[LARG])
faixa.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), COR_ESCURA), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (0, 0), 8), ("BOTTOMPADDING", (0, -1), (-1, -1), 8)]))
historia += [faixa, Spacer(1, 8)]
if DADOS.get("diferencas"):
    historia += [caixa(f'<font color="#9A5B05"><b>{E(DADOS.get("rotulo_diferencas", "Diferente da análise"))}:</b></font> ' + E("; ".join(DADOS["diferencas"])) + ".", COR_LARANJA, COR_LARANJA_BG), Spacer(1, 8)]

for s in DADOS.get("secoes", []):
    bloco = [secao(s.get("numero"), s["titulo"])]
    t = pares(s.get("campos", []))
    if t:
        bloco.append(t)
    if s.get("tabela"):
        tb = s["tabela"]
        if tb.get("titulo"):
            bloco += [Spacer(1, 4), Paragraph(E(tb["titulo"]), S_PEQ)]
        bloco += [Spacer(1, 2), tabela(tb["cab"], tb["linhas"], tb.get("larguras"), tb.get("cores"))]
    if s.get("texto"):
        bloco += [Spacer(1, 4), Paragraph(E(s.get("texto_titulo", "")), S_PEQ), Paragraph(E(s["texto"]).replace("\n", "<br/>"), S_TXT)]
    historia += [KeepTogether(bloco[:3]), *bloco[3:], Spacer(1, 10)]

historia.append(Paragraph("Documento gerado pelo portal MyBlue com os dados da implantação na data de emissão.", S_PEQ))

doc = SimpleDocTemplate(SAIDA, pagesize=A4, leftMargin=MARG, rightMargin=MARG, topMargin=MARG + 42, bottomMargin=MARG + 8,
                        title=f"Formulário de Implantação {DADOS.get('protocolo') or ''}", author="MyBlue")
doc.build(historia, onFirstPage=decorar, onLaterPages=decorar)
print(json.dumps({"paginas": doc.page}))
