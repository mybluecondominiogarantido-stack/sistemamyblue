"""
Retorno de Análise de Crédito MyBlue - padrão oficial (template em branco)
Formato: PDF A4 PAISAGEM (landscape), 4 páginas.

No portal: layout, cores, dimensões e classes são os do gerador canônico. Só mudam a entrada e a saída:
  python3 gerador_retorno.py <dados.json> <saida.pdf> <logo.png>
O DADOS vem do JSON montado por server/credito/retorno.js; ao terminar, imprime {"paginas": N}.
"""
import sys
import json
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, PageBreak, Flowable, HRFlowable
)

OUTPUT = sys.argv[2] if len(sys.argv) > 2 else "retorno.pdf"
LOGO = sys.argv[3] if len(sys.argv) > 3 else "logo.png"

# ==================================================
# Cores MyBlue
# ==================================================
COR_PRIMARIA  = HexColor("#1B9BBC")
COR_ESCURA    = HexColor("#0E5C73")
COR_CLARA     = HexColor("#EBF5F9")
COR_BORDA     = HexColor("#B8D8E2")
COR_TEXTO     = HexColor("#2C3E50")
COR_LEVE      = HexColor("#7A8A95")
COR_LARANJA   = HexColor("#F2A93B")
COR_LARANJA_BG = HexColor("#FFF4E0")
COR_VERDE     = HexColor("#3D9970")
COR_VERDE_BG  = HexColor("#E8F5EC")
COR_VERMELHO  = HexColor("#C0392B")
COR_VERMELHO_BG = HexColor("#FBEAE8")
COR_AZUL_INFO = HexColor("#2874A6")
COR_AZUL_INFO_BG = HexColor("#E8EFF7")
COR_CINZA_HEAD = HexColor("#5A6770")

PAGE_W, PAGE_H = landscape(A4)   # 842 x 595 pt
MARG_L = 1.5 * cm
MARG_R = 1.5 * cm
MARG_T = 1.5 * cm
MARG_B = 1.5 * cm

# ==================================================
# DADOS (apenas este bloco muda a cada análise)
# ==================================================
with open(sys.argv[1], encoding="utf-8") as _f:
    DADOS = json.load(_f)

# ✓ e ✗ não existem na Helvetica do ReportLab (saem como "NO GLYPH"): vêm de uma fonte TrueType embutida no PDF
# (DejaVu Sans Bold; outra pode ser indicada em CREDITO_FONTE_SIMBOLOS). Sem ela, a ZapfDingbats ("4" = ✔, "8" = ✘).
import os
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
FONTE_SIMBOLOS, CHECK, XIS = 'ZapfDingbats', '4', '8'
for _caminho in [os.environ.get('CREDITO_FONTE_SIMBOLOS', ''), '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
    if _caminho and os.path.exists(_caminho):
        pdfmetrics.registerFont(TTFont('Simbolos', _caminho))
        FONTE_SIMBOLOS, CHECK, XIS = 'Simbolos', '✓', '✗'
        break

# Configuração visual do status
STATUS_CONFIG = {
    'APROVADA':               {'cor': COR_VERDE,    'bg': COR_VERDE_BG,    'icone': CHECK, 'fonte_icone': FONTE_SIMBOLOS},
    'APROVADA COM RESSALVAS': {'cor': COR_LARANJA,  'bg': COR_LARANJA_BG,  'icone': '!'},
    'REPROVADA':              {'cor': COR_VERMELHO, 'bg': COR_VERMELHO_BG, 'icone': XIS, 'fonte_icone': FONTE_SIMBOLOS},
    'PENDENTE':               {'cor': COR_AZUL_INFO,'bg': COR_AZUL_INFO_BG,'icone': '?'},
}


# ==================================================
# Decoração de página: logo + canto azul + rodapé
# ==================================================
def draw_logo_myblue(c, x, y):
    """Logo oficial MyBlue (PNG extraído do PDF original)."""
    # Largura 140 pts; altura proporcional (preserveAspectRatio)
    c.drawImage(LOGO,
                x, y - 8, width=140, height=42,
                mask='auto', preserveAspectRatio=True)


def draw_corner_triangle(c):
    """Canto decorativo azul-claro no topo direito."""
    c.saveState()
    c.setFillColor(COR_CLARA)
    p = c.beginPath()
    p.moveTo(PAGE_W - 75, PAGE_H)
    p.lineTo(PAGE_W, PAGE_H)
    p.lineTo(PAGE_W, PAGE_H - 75)
    p.close()
    c.drawPath(p, fill=1, stroke=0)
    c.setStrokeColor(COR_PRIMARIA)
    c.setLineWidth(0.8)
    c.line(PAGE_W - 65, PAGE_H - 5, PAGE_W - 5, PAGE_H - 65)
    c.restoreState()


def page_decoration(c, doc):
    draw_corner_triangle(c)
    draw_logo_myblue(c, MARG_L, PAGE_H - MARG_T - 16)
    # rodapé
    c.setStrokeColor(COR_BORDA)
    c.setLineWidth(0.4)
    c.line(MARG_L, MARG_B - 4, PAGE_W - MARG_R, MARG_B - 4)
    c.setFillColor(COR_LEVE)
    c.setFont("Helvetica", 7.5)
    c.drawString(MARG_L, MARG_B - 14,
                 "MyBlue Condomínio Garantido  |  contato@myblue.com.br  |  www.myblue.com.br  |  (85) 4042.9277")
    c.drawRightString(PAGE_W - MARG_R, MARG_B - 14, f"{doc.page} / 4")


# ==================================================
# Flowables customizados
# ==================================================
class StatusPrecificacaoBox(Flowable):
    """Badge de status (esquerda) + caixa azul de precificação (direita)."""
    def __init__(self, status, taxa_adm, boleto, width):
        Flowable.__init__(self)
        self.status = status
        self.taxa_adm = taxa_adm
        self.boleto = boleto
        self.width = width
        self.height = 80
        self.cfg = STATUS_CONFIG.get(status, STATUS_CONFIG['APROVADA'])

    def draw(self):
        c = self.canv
        left_w = self.width * 0.40
        right_w = self.width * 0.58
        gap = self.width * 0.02

        # STATUS BADGE (esquerda)
        c.setFillColor(self.cfg['bg'])
        c.setStrokeColor(self.cfg['cor'])
        c.setLineWidth(1.2)
        c.roundRect(0, 0, left_w, self.height, 8, fill=1, stroke=1)

        # Ícone
        c.setFillColor(self.cfg['cor'])
        c.setFont(self.cfg.get('fonte_icone', "Helvetica-Bold"), 32)
        c.drawString(20, self.height/2 - 12, self.cfg['icone'])

        # Label
        c.setFillColor(COR_LEVE)
        c.setFont("Helvetica", 8)
        c.drawString(70, self.height - 24, "STATUS DA ANÁLISE")

        # Status texto
        c.setFillColor(self.cfg['cor'])
        c.setFont("Helvetica-Bold", 16)
        if "RESSALVAS" in self.status:
            c.drawString(70, self.height - 46, "APROVADA COM")
            c.drawString(70, self.height - 64, "RESSALVAS")
        else:
            c.drawString(70, self.height - 50, self.status)

        # PRECIFICAÇÃO (direita) — caixa azul-escura
        x_right = left_w + gap
        c.setFillColor(COR_ESCURA)
        c.roundRect(x_right, 0, right_w, self.height, 8, fill=1, stroke=0)

        c.setFillColor(HexColor("#A8C8D5"))
        c.setFont("Helvetica", 8)
        c.drawString(x_right + 16, self.height - 18, "PRECIFICAÇÃO")

        # Divisória vertical
        mid_x = x_right + right_w / 2
        c.setStrokeColor(HexColor("#2C7A91"))
        c.setLineWidth(0.7)
        c.line(mid_x, 12, mid_x, self.height - 26)

        # Taxa admin (esquerda do bloco azul)
        c.setFillColor(HexColor("#A8C8D5"))
        c.setFont("Helvetica", 8)
        c.drawString(x_right + 16, self.height - 38, "Taxa administrativa")
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(x_right + 16, 18, self.taxa_adm)

        # Boleto (direita do bloco azul)
        c.setFillColor(HexColor("#A8C8D5"))
        c.setFont("Helvetica", 8)
        c.drawString(mid_x + 16, self.height - 38, "Valor do boleto")
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(mid_x + 16, 18, self.boleto)


class ObservacoesBox(Flowable):
    """Caixa com borda contendo parágrafo de observações."""
    def __init__(self, texto, width):
        Flowable.__init__(self)
        self.texto = texto
        self.width = width
        styles = getSampleStyleSheet()
        st = ParagraphStyle('obs', parent=styles['Normal'], fontName='Helvetica',
                            fontSize=9, leading=13, textColor=COR_TEXTO, alignment=TA_LEFT)
        self.para = Paragraph(texto, st)
        w, h = self.para.wrap(width - 28, 300)
        self.height = max(h + 24, 50)

    def draw(self):
        c = self.canv
        c.setStrokeColor(COR_BORDA)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, self.width, self.height, 4, fill=0, stroke=1)
        self.para.drawOn(c, 14, 12)


class GanhoAnualBar(Flowable):
    """Barra verde sólida para 'GANHO ANUAL'."""
    def __init__(self, label, valor, width):
        Flowable.__init__(self)
        self.label = label
        self.valor = valor
        self.width = width
        self.height = 28

    def draw(self):
        c = self.canv
        c.setFillColor(COR_VERDE)
        c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(16, 10, self.label)
        c.setFont("Helvetica-Bold", 15)
        c.drawRightString(self.width - 16, 8, self.valor)


class ExposicaoCards(Flowable):
    """3 cards de exposição. Terceiro destacado em azul-escuro sólido."""
    def __init__(self, label1, valor1, label2, valor2, label3, valor3, width):
        Flowable.__init__(self)
        self.itens = [(label1, valor1, False), (label2, valor2, False), (label3, valor3, True)]
        self.width = width
        self.height = 65

    def draw(self):
        c = self.canv
        gap = 12
        card_w = (self.width - 2 * gap) / 3
        for i, (label, valor, destaque) in enumerate(self.itens):
            x = i * (card_w + gap)
            if destaque:
                c.setFillColor(COR_ESCURA)
                c.roundRect(x, 0, card_w, self.height, 6, fill=1, stroke=0)
                c.setFillColor(HexColor("#A8C8D5"))
                c.setFont("Helvetica", 8)
                c.drawString(x + 16, self.height - 20, label.upper())
                c.setFillColor(white)
                c.setFont("Helvetica-Bold", 20)
                c.drawString(x + 16, 16, valor)
            else:
                c.setFillColor(COR_CLARA)
                c.setStrokeColor(COR_BORDA)
                c.setLineWidth(0.5)
                c.roundRect(x, 0, card_w, self.height, 6, fill=1, stroke=1)
                c.setFillColor(COR_LEVE)
                c.setFont("Helvetica", 8)
                c.drawString(x + 16, self.height - 20, label)
                c.setFillColor(COR_ESCURA)
                c.setFont("Helvetica-Bold", 18)
                c.drawString(x + 16, 16, valor)


# ==================================================
# Estilos
# ==================================================
styles = getSampleStyleSheet()
st_titulo = ParagraphStyle('TituloPg', parent=styles['Title'], fontName='Helvetica-Bold',
                           fontSize=22, leading=26, textColor=COR_ESCURA, alignment=TA_LEFT,
                           spaceBefore=0, spaceAfter=0)
st_subtitulo_pg = ParagraphStyle('SubPg', parent=styles['Normal'], fontName='Helvetica',
                                  fontSize=10, leading=13, textColor=COR_LEVE, alignment=TA_LEFT,
                                  spaceBefore=2, spaceAfter=10)
st_normal = ParagraphStyle('Normal9', parent=styles['Normal'], fontName='Helvetica',
                            fontSize=9, leading=12, textColor=COR_TEXTO, alignment=TA_LEFT)
st_faixa_it = ParagraphStyle('FaixaIt', parent=styles['Normal'], fontName='Helvetica-Oblique',
                              fontSize=9, leading=12, textColor=COR_LEVE, alignment=TA_LEFT,
                              spaceBefore=4, spaceAfter=4)
st_obs_italico = ParagraphStyle('ObsIt', parent=styles['Normal'], fontName='Helvetica-Oblique',
                                fontSize=8.5, leading=11, textColor=COR_LEVE, alignment=TA_LEFT,
                                spaceBefore=4, spaceAfter=2)


def secao_titulo(texto):
    return Paragraph(
        f'<font color="#1B9BBC" size="14"><b>|</b></font> <b><font color="#1B9BBC">{texto}</font></b>',
        ParagraphStyle('SecTitle', fontName='Helvetica-Bold', fontSize=10.5, leading=14,
                       alignment=TA_LEFT, spaceBefore=12, spaceAfter=6)
    )


# ==================================================
# CONSTRUÇÃO DO DOCUMENTO
# ==================================================
def build():
    doc = BaseDocTemplate(
        OUTPUT, pagesize=landscape(A4),
        leftMargin=MARG_L, rightMargin=MARG_R,
        topMargin=MARG_T + 38, bottomMargin=MARG_B,
        title=f"Retorno de Análise de Crédito - {DADOS['razao_social']}"
    )
    frame = Frame(MARG_L, MARG_B, PAGE_W - MARG_L - MARG_R,
                  PAGE_H - MARG_T - MARG_B - 38, id='main', showBoundary=0,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='all', frames=[frame], onPage=page_decoration)])

    story = []
    full_w = PAGE_W - MARG_L - MARG_R

    # ===== PÁGINA 1 =====
    story.append(Paragraph("Retorno de Análise de Crédito", st_titulo))
    story.append(Paragraph(f"Protocolo {DADOS['protocolo']} • {DADOS['data_analise']}", st_subtitulo_pg))
    story.append(HRFlowable(width=80, thickness=2, color=COR_PRIMARIA, spaceBefore=-6, spaceAfter=12))

    story.append(secao_titulo("CONDOMÍNIO ANALISADO"))

    tab_id = Table([
        [Paragraph("<b>Razão social</b>", st_normal), Paragraph(DADOS['razao_social'], st_normal), '', ''],
        [Paragraph("<b>CNPJ</b>", st_normal), Paragraph(DADOS['cnpj'], st_normal),
         Paragraph("<b>Executivo solicitante</b>", st_normal), Paragraph(DADOS['executivo'], st_normal)],
    ], colWidths=[full_w*0.18, full_w*0.32, full_w*0.20, full_w*0.30])
    tab_id.setStyle(TableStyle([
        ('SPAN', (1, 0), (3, 0)),
        ('BACKGROUND', (0, 0), (0, -1), COR_CLARA),
        ('BACKGROUND', (2, 1), (2, 1), COR_CLARA),
        ('BOX', (0, 0), (-1, -1), 0.5, COR_BORDA),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, COR_BORDA),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    story.append(tab_id)
    story.append(Spacer(1, 14))

    story.append(StatusPrecificacaoBox(DADOS['status'], DADOS['taxa_adm'], DADOS['boleto_myb'], full_w))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"<i>Faixa aplicada (Tabela MyBlue): {DADOS['faixa']} • Validade da proposta: {DADOS['validade']}</i>",
        st_faixa_it
    ))

    story.append(secao_titulo("OBSERVAÇÕES DA ANÁLISE"))
    story.append(Spacer(1, 2))
    story.append(ObservacoesBox(DADOS['observacoes_status'], full_w))

    # ===== PÁGINA 2 =====
    story.append(PageBreak())
    story.append(Paragraph("Ganho real e memória de cálculo", st_titulo))
    story.append(Paragraph("Comparativo de cenários e base de apuração da precificação", st_subtitulo_pg))
    story.append(HRFlowable(width=80, thickness=2, color=COR_PRIMARIA, spaceBefore=-6, spaceAfter=12))

    story.append(secao_titulo("GANHO REAL PARA O CONDOMÍNIO COM A CONTRATAÇÃO"))

    comp = DADOS['comp']
    tab_ganho = Table([
        ['Descrição', 'Sem MyBlue', 'Com MyBlue'],
        ['Arrecadação líquida', comp['arrec_sem'], comp['arrec_com']],
        ['(−) Inadimplência', comp['inad_sem'], comp['inad_com']],
        ['(−) Taxa administrativa', comp['taxa_sem'], comp['taxa_com']],
        ['(−) Custo de boletos', comp['bol_sem'], comp['bol_com']],
        ['Recebimento final', comp['receb_sem'], comp['receb_com']],
    ], colWidths=[full_w*0.34, full_w*0.33, full_w*0.33])
    tab_ganho.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), COR_PRIMARIA),
        ('BACKGROUND', (1, 0), (1, 0), COR_CINZA_HEAD),
        ('BACKGROUND', (2, 0), (2, 0), COR_PRIMARIA),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (1, 0), (-1, 0), 'CENTER'),
        ('BACKGROUND', (0, -1), (-1, -1), COR_CLARA),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (2, -1), (2, -1), COR_VERDE),
        ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, COR_BORDA),
        ('BOX', (0, 0), (-1, -1), 0.5, COR_BORDA),
    ]))
    story.append(tab_ganho)
    story.append(Spacer(1, 6))

    story.append(GanhoAnualBar("GANHO ANUAL DO CONDOMÍNIO COM A MYBLUE", comp['ganho_anual'], full_w))

    story.append(secao_titulo("MEMÓRIA DE CÁLCULO — INADIMPLÊNCIA"))

    receita_st = ParagraphStyle('vr', parent=st_normal, fontSize=14, leading=16, textColor=COR_ESCURA)
    card_l = Table([
        [Paragraph("Receita bruta mensal", st_obs_italico)],
        [Paragraph(f"<b>{DADOS['receita_bruta']}</b>", receita_st)],
    ], colWidths=[full_w/2 - 5], style=TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COR_CLARA),
        ('BOX', (0, 0), (-1, -1), 0.5, COR_BORDA),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (0, 0), 5),
        ('BOTTOMPADDING', (0, -1), (0, -1), 6),
    ]))
    card_r = Table([
        [Paragraph("Receita líquida mensal", st_obs_italico)],
        [Paragraph(f"<b>{DADOS['receita_liquida']}</b>", receita_st)],
    ], colWidths=[full_w/2 - 5], style=TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COR_CLARA),
        ('BOX', (0, 0), (-1, -1), 0.5, COR_BORDA),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (0, 0), 5),
        ('BOTTOMPADDING', (0, -1), (0, -1), 6),
    ]))
    tab_receitas = Table([[card_l, card_r]], colWidths=[full_w/2 + 5, full_w/2 - 5])
    tab_receitas.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(tab_receitas)
    story.append(Spacer(1, 6))

    data_meses = [['Mês de referência', 'Nº de inadimplentes', 'Valor da inadimplência', 'Percentual sobre receita bruta']]
    data_meses.extend([list(m) for m in DADOS['meses_base']])
    data_meses.append(['MÉDIA', DADOS['inad_media_qtd'], DADOS['inad_media_valor'], DADOS['inad_media_pct']])

    tab_meses = Table(data_meses, colWidths=[full_w*0.20, full_w*0.22, full_w*0.28, full_w*0.30])
    tab_meses.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COR_PRIMARIA),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BACKGROUND', (0, -1), (-1, -1), COR_CLARA),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, -1), (-1, -1), COR_PRIMARIA),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, COR_BORDA),
        ('BOX', (0, 0), (-1, -1), 0.5, COR_BORDA),
    ]))
    story.append(tab_meses)
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<i>{DADOS['nota_base']} {DADOS['nota_dias']}</i>", st_obs_italico))

    # ===== PÁGINA 3 =====
    story.append(PageBreak())
    story.append(Paragraph("Exposição de caixa e exclusões", st_titulo))
    story.append(Paragraph("Resultado operacional e unidades fora do escopo da garantia", st_subtitulo_pg))
    story.append(HRFlowable(width=80, thickness=2, color=COR_PRIMARIA, spaceBefore=-6, spaceAfter=12))

    story.append(secao_titulo("EXPOSIÇÃO MENSAL ESTIMADA"))
    story.append(Spacer(1, 4))
    story.append(ExposicaoCards(
        "Receita MyBlue (taxa adm + boletos)", DADOS['receita_myb'],
        "Valor antecipado ao condomínio", DADOS['valor_antecipado'],
        "EXPOSIÇÃO DE CAIXA MENSAL", DADOS['exposicao'],
        full_w
    ))
    story.append(Spacer(1, 14))

    story.append(secao_titulo("UNIDADES EXCLUÍDAS DO ESCOPO DA GARANTIA"))

    if DADOS['unidades_excluidas']:
        data_excl = [['Unidade', 'Motivo da exclusão', 'Valor aproximado (fora do escopo)']]
        for un, motivo, valor in DADOS['unidades_excluidas']:
            data_excl.append([un, Paragraph(motivo, st_normal), valor])

        tab_excl = Table(data_excl, colWidths=[full_w*0.13, full_w*0.62, full_w*0.25])
        tab_excl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COR_PRIMARIA),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 8.5),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, COR_BORDA),
            ('BOX', (0, 0), (-1, -1), 0.5, COR_BORDA),
        ]))
        story.append(tab_excl)
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            "<i>Estas unidades não compõem o escopo da garantia. A cobrança permanece a cargo do condomínio por meios próprios.</i>",
            st_obs_italico))
    else:
        # Caixa com mensagem indicando que não há exclusões
        sem_excl = Table([[
            Paragraph(
                "<b><font color='#3D9970'><font name='" + FONTE_SIMBOLOS + "'>" + CHECK + "</font> Nenhuma unidade foi excluída do escopo da garantia.</font></b><br/><br/>"
                + DADOS['texto_sem_exclusoes'],
                ParagraphStyle('sem_excl', parent=st_normal, fontSize=10, leading=14)
            )
        ]], colWidths=[full_w], style=TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), HexColor("#E8F5EC")),
            ('BOX', (0, 0), (-1, -1), 0.8, COR_VERDE),
            ('LEFTPADDING', (0, 0), (-1, -1), 18),
            ('RIGHTPADDING', (0, 0), (-1, -1), 18),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ]))
        story.append(sem_excl)

    # ===== PÁGINA 4 =====
    story.append(PageBreak())
    story.append(Paragraph("Observações e próximos passos", st_titulo))
    story.append(Paragraph("Pontos jurídicos relevantes e ações para concluir a contratação", st_subtitulo_pg))
    story.append(HRFlowable(width=80, thickness=2, color=COR_PRIMARIA, spaceBefore=-6, spaceAfter=12))

    col_w = (full_w - 24) / 2

    # Coluna esquerda - Observações
    obs_items = [[secao_titulo("OBSERVAÇÕES JURÍDICAS / DOCUMENTAIS")]]
    for obs in DADOS['observacoes_juridicas']:
        obs_items.append([Paragraph(
            f"<font color='#1B9BBC'>•</font> {obs}",
            ParagraphStyle('obsjur', parent=st_normal, fontSize=9, leading=12,
                           leftIndent=12, firstLineIndent=-12, spaceBefore=5, spaceAfter=5)
        )])

    col_esq = Table(obs_items, colWidths=[col_w], style=TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))

    # Coluna direita - Próximos Passos
    passo_items = [[secao_titulo("PRÓXIMOS PASSOS")]]
    num_st = ParagraphStyle('num', fontName='Helvetica-Bold', fontSize=9.5,
                            textColor=white, alignment=TA_CENTER, leading=12)
    passo_st = ParagraphStyle('passo', parent=st_normal, fontSize=9, leading=12)
    for i, passo in enumerate(DADOS['proximos_passos'], 1):
        badge = Table([[Paragraph(str(i), num_st)]], colWidths=[18], rowHeights=[18],
                      style=TableStyle([
                          ('BACKGROUND', (0, 0), (-1, -1), COR_PRIMARIA),
                          ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                          ('LEFTPADDING', (0, 0), (-1, -1), 0),
                          ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                          ('TOPPADDING', (0, 0), (-1, -1), 0),
                          ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                      ]))
        linha = Table([
            [badge, Paragraph(passo, passo_st)],
        ], colWidths=[22, col_w - 28], style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (0, 0), 6),
            ('TOPPADDING', (1, 0), (1, 0), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        passo_items.append([linha])

    col_dir = Table(passo_items, colWidths=[col_w], style=TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))

    tab_cols = Table([[col_esq, col_dir]], colWidths=[col_w, col_w])
    tab_cols.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 12),
        ('LEFTPADDING', (1, 0), (1, 0), 12),
        ('RIGHTPADDING', (1, 0), (1, 0), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(tab_cols)

    # Espaço antes da assinatura
    story.append(Spacer(1, 30))

    # Assinatura
    assinatura = Table([
        [Paragraph(f"<b>{DADOS['analista']}</b><br/><font color='#7A8A95'>Análise de Crédito — MyBlue</font>",
                   ParagraphStyle('assin', parent=st_normal, fontSize=9.5, leading=13)),
         Paragraph(f"<para alignment='right'>Protocolo: {DADOS['protocolo']}<br/>"
                   f"Validade desta proposta: {DADOS['validade']}</para>",
                   ParagraphStyle('val', parent=st_normal, fontSize=9, leading=12, textColor=COR_LEVE))],
    ], colWidths=[full_w*0.5, full_w*0.5])
    assinatura.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (0, 0), 0.8, COR_TEXTO),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(assinatura)

    doc.build(story)
    print(json.dumps({"paginas": doc.page}))


if __name__ == "__main__":
    build()
