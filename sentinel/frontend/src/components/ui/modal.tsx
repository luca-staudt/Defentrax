"use client";

import { Modal as RsModal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}) {
  return (
    <RsModal isOpen={isOpen} toggle={onClose} centered scrollable size="lg">
      <ModalHeader toggle={onClose}>
        {title}
        {subtitle ? <p className="text-muted fs-13 mb-0 fw-normal">{subtitle}</p> : null}
      </ModalHeader>
      <ModalBody>{children}</ModalBody>
      {footer ? <ModalFooter>{footer}</ModalFooter> : null}
    </RsModal>
  );
}
